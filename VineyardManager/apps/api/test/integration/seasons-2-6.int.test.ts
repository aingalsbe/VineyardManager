/// <reference path="../../src/types/express.d.ts" />
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server } from "node:http";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { API_PREFIX } from "@vineyard/shared";
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/modules/auth/tokens.js";
import { assertDisposableSeasonDatabase } from "../../scripts/backfill-seasons.ts";

function requiredDatabaseUrl(): string {
  const url = process.env.SEASONS_TEST_DATABASE_URL;
  assert.ok(url, "SEASONS_TEST_DATABASE_URL is required");
  return url;
}

const databaseUrl = requiredDatabaseUrl();
const THRESHOLDS = { greenMin: 80, yellowMin: 70, orangeMin: 60 };

type HttpResult = { status: number; body: unknown };

function assertHttpDatabase(): void {
  const appUrl = process.env.DATABASE_URL;
  if (!appUrl) throw new Error("DATABASE_URL is not set");
  if (appUrl !== databaseUrl) {
    throw new Error("DATABASE_URL must equal SEASONS_TEST_DATABASE_URL");
  }
}

function requireJwtSecret(): void {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error("JWT_SECRET is not set");
  }
}

export function httpJson(
  base: URL,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  requestPath: string,
  authorization: string | null,
  json?: unknown,
  timeoutMs = 15_000,
): Promise<HttpResult> {
  const payload = json !== undefined ? Buffer.from(JSON.stringify(json)) : null;
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      accept: "application/json",
    };
    if (payload) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(payload.length);
    }
    if (authorization) headers.authorization = authorization;
    const req = httpRequest(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port,
        path: requestPath,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let body: unknown = null;
          if (text.length > 0) {
            try {
              body = JSON.parse(text) as unknown;
            } catch {
              body = null;
            }
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(
        new Error(`HTTP ${method} ${requestPath} timed out after ${timeoutMs}ms`),
      );
    });
    req.on("error", reject);
    if (payload) req.end(payload);
    else req.end();
  });
}

async function createUser(
  prisma: PrismaClient,
  stamp: string,
  role: "viewer" | "manager" | "power_user",
  label: string,
) {
  return prisma.user.create({
    data: {
      email: `s26-${label}-${stamp}@example.invalid`,
      passwordHash: "fixture",
      displayName: `Season26 ${label}`,
      role,
      notificationPrefs: {},
    },
  });
}

async function createVineyard(
  prisma: PrismaClient,
  ownerId: string,
  timeZone = "America/Chicago",
) {
  return prisma.vineyard.create({
    data: {
      ownerId,
      name: "Seasons 2-6 Fixture",
      address: "Columbia, MO",
      timezone: timeZone,
      healthThresholds: THRESHOLDS,
      lat: "38.951700",
      lng: "-92.334100",
    },
  });
}

async function cleanup(
  prisma: PrismaClient,
  ownerId: string | null,
  userIds: readonly string[],
): Promise<void> {
  if (ownerId) {
    const vineyards = await prisma.vineyard.findMany({
      where: { ownerId },
      select: { id: true },
    });
    const ids = vineyards.map((v) => v.id);
    if (ids.length > 0) {
      await prisma.seasonSummaryMail.deleteMany({
        where: { vineyardId: { in: ids } },
      });
      await prisma.digestLog.deleteMany({ where: { vineyardId: { in: ids } } });
      await prisma.activity.deleteMany({ where: { vineyardId: { in: ids } } });
      await prisma.harvest.deleteMany({ where: { vineyardId: { in: ids } } });
      await prisma.task.deleteMany({ where: { vineyardId: { in: ids } } });
      await prisma.season.deleteMany({ where: { vineyardId: { in: ids } } });
      await prisma.row.deleteMany({ where: { vineyardId: { in: ids } } });
      await prisma.vineyard.deleteMany({ where: { id: { in: ids } } });
    }
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
  }
}

test("seasons 2-6 integration suite: migration indexes and season read API (A1)", async () => {
  assertHttpDatabase();
  requireJwtSecret();

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const userIds: string[] = [];
  let ownerId: string | null = null;
  let server: Server | null = null;

  // Fail-closed fetch mock: no real network calls allowed in integration tests
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("unmocked fetch in seasons-2-6.int.test.ts");
  };

  try {
    const [vineyardCount, userCount] = await Promise.all([
      prisma.vineyard.count(),
      prisma.user.count(),
    ]);
    assertDisposableSeasonDatabase({
      vineyardCount,
      userCount,
      disposableFlag: process.env.SEASONS_TEST_DB_DISPOSABLE,
    });

    // 1. Verify all hand-written partial indexes survived migration + new partial index exists
    const expectedIndexes = [
      "digest_logs_scheduled_once",
      "seasons_one_active_per_vineyard",
      "seasons_one_planned_per_vineyard",
      "tasks_vineyard_status_due_live_idx",
      "activities_vineyard_type_perf_live_idx",
      "tasks_season_template_key_live_unique",
    ];
    const indexRows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `;
    const foundIndexes = new Set(indexRows.map((row) => row.indexname));
    for (const idx of expectedIndexes) {
      assert.ok(foundIndexes.has(idx), `expected hand-written index missing: ${idx}`);
    }

    // 2. Start HTTP server
    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server?.once("error", reject);
      server?.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = new URL(`http://127.0.0.1:${address.port}`);

    const owner = await createUser(prisma, stamp, "power_user", "owner");
    ownerId = owner.id;
    const manager = await createUser(prisma, stamp, "manager", "manager");
    const viewer = await createUser(prisma, stamp, "viewer", "viewer");
    userIds.push(owner.id, manager.id, viewer.id);

    const tokens = {
      power_user: `Bearer ${signAccessToken(owner)}`,
      manager: `Bearer ${signAccessToken(manager)}`,
      viewer: `Bearer ${signAccessToken(viewer)}`,
    };

    // 3. A1: Active vineyard -> seasons list & current readable by all roles
    const vineyard = await createVineyard(prisma, owner.id);
    const activeSeason = await prisma.season.create({
      data: {
        vineyardId: vineyard.id,
        year: 2026,
        status: "active",
        startedAt: new Date("2026-03-01T18:00:00.000Z"),
      },
    });

    for (const role of ["viewer", "manager", "power_user"] as const) {
      const listRes = await httpJson(
        base,
        "GET",
        `${API_PREFIX}/vineyards/${vineyard.id}/seasons`,
        tokens[role],
      );
      assert.equal(listRes.status, 200, `${role} should read seasons list`);
      const listData = (listRes.body as { data: Array<{ id: string; year: number; status: string; hasSummary: boolean }> }).data;
      assert.equal(listData.length, 1);
      assert.equal(listData[0]?.id, activeSeason.id);
      assert.equal(listData[0]?.year, 2026);
      assert.equal(listData[0]?.status, "active");
      assert.equal(listData[0]?.hasSummary, false);

      const curRes = await httpJson(
        base,
        "GET",
        `${API_PREFIX}/vineyards/${vineyard.id}/seasons/current`,
        tokens[role],
      );
      assert.equal(curRes.status, 200, `${role} should read current season`);
      const cur = (curRes.body as { data: { dormant: boolean; season: { id: string } | null } }).data;
      assert.equal(cur.dormant, false);
      assert.equal(cur.season?.id, activeSeason.id);
    }

    // 4. A1: Dormant vineyard (closed + planned, no active)
    const closedAt = new Date("2026-11-10T18:00:00.000Z");
    await prisma.season.update({
      where: { id: activeSeason.id },
      data: { status: "closed", closedAt },
    });
    const planned = await prisma.season.create({
      data: { vineyardId: vineyard.id, year: 2027, status: "planned" },
    });

    const dormantRes = await httpJson(
      base,
      "GET",
      `${API_PREFIX}/vineyards/${vineyard.id}/seasons/current`,
      tokens.viewer,
    );
    assert.equal(dormantRes.status, 200);
    const dormantData = (dormantRes.body as {
      data: {
        dormant: boolean;
        dormantSince: string | null;
        lastClosedSeason: { id: string; reopenableUntil: string | null } | null;
        plannedSeason: { id: string; year: number } | null;
      };
    }).data;
    assert.equal(dormantData.dormant, true);
    assert.equal(dormantData.dormantSince, closedAt.toISOString());
    assert.equal(dormantData.lastClosedSeason?.id, activeSeason.id);
    assert.ok(dormantData.lastClosedSeason?.reopenableUntil);
    assert.equal(dormantData.plannedSeason?.id, planned.id);
    assert.equal(dormantData.plannedSeason?.year, 2027);
  } finally {
    globalThis.fetch = originalFetch;
    try {
      await cleanup(prisma, ownerId, userIds);
    } finally {
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server?.close((err) => (err ? reject(err) : resolve()));
        });
      }
      await prisma.$disconnect();
    }
  }
});
