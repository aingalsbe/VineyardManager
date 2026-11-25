import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import {
  createActivitySchema,
  createHarvestSchema,
  createVineyardSchema,
  loginSchema,
  updateMeSchema,
} from "@vineyard/shared";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { requireCsrfForCookieMutations } from "../src/modules/auth/auth.middleware.js";
import {
  parseExpiresInMs,
  signAccessToken,
  verifyAccessToken,
} from "../src/modules/auth/tokens.js";
import { render as renderDigest } from "../src/modules/digest/digest.template.js";
import { detectLogoMime } from "../src/modules/vineyards/logo.js";

async function startServer(app: ReturnType<typeof createApp>) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  return { baseUrl, close };
}

test("security headers are set and X-Powered-By is disabled", async () => {
  const { baseUrl, close } = await startServer(createApp({ rateLimit: false }));
  try {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-powered-by"), null);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.ok(res.headers.get("x-frame-options"));
  } finally {
    await close();
  }
});

test("malformed JSON returns 400 VALIDATION_ERROR instead of 500", async () => {
  const { baseUrl, close } = await startServer(createApp({ rateLimit: false }));
  try {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "VALIDATION_ERROR");
  } finally {
    await close();
  }
});

test("rate limiting returns 429 RATE_LIMITED after threshold on forgot-password", async () => {
  const { baseUrl, close } = await startServer(createApp({ rateLimit: true }));
  try {
    // 5 invalid-email requests hit the rate limiter (before validation/DB)
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      });
      assert.equal(res.status, 400);
    }
    const blocked = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    assert.equal(blocked.status, 429);
    const body = (await blocked.json()) as { error: { code: string } };
    assert.equal(body.error.code, "RATE_LIMITED");
  } finally {
    await close();
  }
});

test("JWT includes tokenVersion (tv) and rejects tokens missing tv or using alg none", () => {
  const token = signAccessToken({
    id: "00000000-0000-4000-8000-000000000001",
    email: "owner@vineyard.local",
    role: "power_user",
    displayName: "Owner",
    tokenVersion: 3,
  });
  const verified = verifyAccessToken(token);
  assert.equal(verified.tokenVersion, 3);

  const legacyWithoutTv = jwt.sign(
    {
      sub: "00000000-0000-4000-8000-000000000001",
      email: "owner@vineyard.local",
      role: "power_user",
      displayName: "Owner",
    },
    config.jwtSecret,
    { algorithm: "HS256" },
  );
  assert.throws(() => verifyAccessToken(legacyWithoutTv));

  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "00000000-0000-4000-8000-000000000001",
      email: "owner@vineyard.local",
      role: "power_user",
      displayName: "Owner",
      tv: 0,
    }),
  ).toString("base64url");
  assert.throws(() => verifyAccessToken(`${header}.${payload}.`));

  assert.equal(parseExpiresInMs("7d"), 7 * 86_400_000);
  assert.equal(parseExpiresInMs("24h"), 24 * 3_600_000);
});

test("CSRF middleware blocks cross-site cookie mutations and allows valid same-origin fetch or bearer", () => {
  const runMiddleware = (req: Record<string, unknown>): unknown => {
    let captured: unknown = null;
    requireCsrfForCookieMutations(
      req as never,
      {} as never,
      (err?: unknown) => {
        captured = err ?? null;
      },
    );
    return captured;
  };

  // Safe GET with cookie passes
  assert.equal(
    runMiddleware({ authSource: "cookie", method: "GET", headers: {} }),
    null,
  );
  // Bearer POST without CSRF headers passes (mobile/CLI clients)
  assert.equal(
    runMiddleware({ authSource: "bearer", method: "POST", headers: {} }),
    null,
  );
  // Cookie POST without X-Requested-With fails
  assert.ok(
    runMiddleware({
      authSource: "cookie",
      method: "POST",
      headers: { origin: config.webOrigin },
    }),
  );
  // Cookie POST with wrong Origin fails
  assert.ok(
    runMiddleware({
      authSource: "cookie",
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "x-requested-with": "fetch",
      },
    }),
  );
  // Cookie POST with matching Origin and X-Requested-With passes
  assert.equal(
    runMiddleware({
      authSource: "cookie",
      method: "POST",
      headers: {
        origin: config.webOrigin,
        "x-requested-with": "fetch",
      },
    }),
    null,
  );
});

test("detectLogoMime validates image magic bytes and rejects spoofed text/HTML", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const webp = Buffer.from("RIFF\x24\x00\x00\x00WEBPVP8 ", "latin1");
  const spoofedHtml = Buffer.from("<html><script>alert(1)</script></html>");

  assert.equal(detectLogoMime(png), "image/png");
  assert.equal(detectLogoMime(jpeg), "image/jpeg");
  assert.equal(detectLogoMime(webp), "image/webp");
  assert.equal(detectLogoMime(spoofedHtml), null);
});

test("shared Zod schemas enforce password length, IANA timezone, DB bounds, and details cap", () => {
  assert.equal(
    loginSchema.safeParse({ email: "a@b.com", password: "x".repeat(73) }).success,
    false,
  );
  assert.equal(
    updateMeSchema.safeParse({
      email: "new@b.com",
      currentPassword: "secret-password",
    }).success,
    true,
  );
  assert.equal(
    createVineyardSchema.safeParse({
      name: "V",
      address: "123 Rd",
      timezone: "Mars/Olympus_Mons",
    }).success,
    false,
  );
  assert.equal(
    createVineyardSchema.safeParse({
      name: "V",
      address: "123 Rd",
      timezone: "America/Chicago",
    }).success,
    true,
  );
  assert.equal(
    createActivitySchema.safeParse({
      scopeType: "vineyard",
      scopeId: "00000000-0000-4000-8000-000000000001",
      activityType: "watering",
      details: { notes: "a".repeat(9000) },
    }).success,
    false,
  );
  assert.equal(
    createHarvestSchema.safeParse({
      rowId: "00000000-0000-4000-8000-000000000001",
      harvestedAt: "2026-09-15",
      yieldAmount: 1_000_000,
      yieldUnit: "lb",
    }).success,
    false,
  );
});

test("digest template hides raw weather provider errors and adds rel=noopener noreferrer", () => {
  const rendered = renderDigest({
    vineyard: { id: "v1", name: "Abide Vineyard", timeZone: "America/Chicago" },
    weekStart: "2026-07-06",
    asOfDate: "2026-07-06",
    generatedAt: "2026-07-06T11:30:00.000Z",
    appUrl: "https://abidevine.hipfog.com",
    tasks: {
      overdueCount: 0,
      upcomingCount: 0,
      overdue: [],
      upcoming: [],
      listLimit: 10,
    },
    weather: {
      available: false,
      unavailableReason: "Open-Meteo forecast failed (503) internal-host",
      alerts: [],
      outlook: [],
    },
    health: { score: 92, color: "green", reasons: [] },
  });

  assert.equal(rendered.html.includes("internal-host"), false);
  assert.equal(rendered.text.includes("internal-host"), false);
  assert.equal(rendered.html.includes("503"), false);
  assert.ok(rendered.html.includes('target="_blank" rel="noopener noreferrer"'));
  assert.equal(/target="_blank"(?!\s+rel="noopener noreferrer")/.test(rendered.html), false);
});

test("api-entrypoint.sh fails closed when MAIL_TRANSPORT=resend lacks RESEND_API_KEY", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const entrypoint = path.resolve(here, "../../../deploy/scripts/api-entrypoint.sh");

  const baseEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    DEPLOY_PROFILE: "production",
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@db:5432/v",
    JWT_SECRET: "a".repeat(64),
    APP_URL: "https://abidevine.hipfog.com",
    WEB_ORIGIN: "https://abidevine.hipfog.com",
    MAIL_FROM: "Vineyard <noreply@abidevine.hipfog.com>",
    UPLOAD_DIR: "/data/uploads",
    WEATHER_CRON_ENABLED: "false",
    DIGEST_CRON_ENABLED: "false",
    MAIL_TRANSPORT: "resend",
  };

  const missing = spawnSync("sh", [entrypoint, "true"], {
    env: baseEnv,
    encoding: "utf8",
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /RESEND_API_KEY/);

  const valid = spawnSync("sh", [entrypoint, "true"], {
    env: { ...baseEnv, RESEND_API_KEY: "re_test_key" },
    encoding: "utf8",
  });
  assert.equal(valid.status, 0, valid.stderr);
});
