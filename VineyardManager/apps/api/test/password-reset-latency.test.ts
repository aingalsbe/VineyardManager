import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";

const scenario = process.env.LATENCY_CASE ?? "";
const here = path.dirname(fileURLToPath(import.meta.url));
const self = fileURLToPath(import.meta.url);
const apiRoot = path.resolve(here, "..");
const KNOWN = "known@example.invalid";
const UNKNOWN = "unknown@example.invalid";

function safeFailure(error: unknown): string {
  const text = error instanceof Error ? error.message : "scenario failed";
  if (text.includes("example.invalid") || text.includes("reset-password") || text.includes("token=")) {
    return "scenario failed";
  }
  return text.slice(0, 300);
}

if (scenario) {
  let unhandled = 0;
  process.on("unhandledRejection", () => {
    unhandled += 1;
  });
  try {
    const payload = await runChild(scenario, () => unhandled);
    if (scenario === "reject") {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    payload.unhandled = unhandled;
    process.stdout.write(`RESULT ${JSON.stringify(payload)}\n`);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`${safeFailure(error)}\n`);
    process.exit(1);
  }
}

type LatencyPayload = {
  ms: number;
  generic: boolean;
  hasDevResetUrl: boolean;
  transactionFinished: boolean;
  transactionBeforeReturn: boolean;
  createCount: number;
  sendCalls: number;
  unhandled: number;
};

async function runChild(name: string, unhandled: () => number): Promise<LatencyPayload> {
  const state = {
    createCount: 0,
    transactionFinished: false,
    transactionAt: 0,
    sendCalls: 0,
  };
  const fake = {
    user: {
      async findFirst(args: { where?: { email?: string } }) {
        if (args.where?.email === KNOWN) {
          return { id: "user-1", email: KNOWN };
        }
        return null;
      },
    },
    passwordReset: {
      async updateMany() {
        return { count: 0 };
      },
      async create() {
        state.createCount += 1;
        return { id: "reset-1" };
      },
    },
    async $transaction(ops: readonly Promise<unknown>[]) {
      await Promise.all(ops);
      state.transactionFinished = true;
      state.transactionAt = performance.now();
      return ops;
    },
  };
  (globalThis as unknown as { prisma?: unknown }).prisma = fake;

  const nodemailer = (await import("nodemailer")).default;
  mock.method(nodemailer, "createTransport", () => ({
    sendMail() {
      state.sendCalls += 1;
      if (name === "reject") {
        throw new Error("send failed");
      }
      return new Promise(() => {});
    },
  }));

  const { requestPasswordReset } = await import("../src/modules/auth/account.service.ts");
  const email = name === "unknown" ? UNKNOWN : KNOWN;
  const started = performance.now();
  const result = await requestPasswordReset(email);
  const returnedAt = performance.now();
  return {
    ms: returnedAt - started,
    generic: result.ok === true && result.devResetUrl === undefined,
    hasDevResetUrl: typeof result.devResetUrl === "string" && result.devResetUrl.length > 0,
    transactionFinished: state.transactionFinished,
    transactionBeforeReturn: state.transactionAt > 0 && state.transactionAt <= returnedAt,
    createCount: state.createCount,
    sendCalls: state.sendCalls,
    unhandled: unhandled(),
  };
}

const MAIL_KEYS = [
  "MAIL_TRANSPORT",
  "RESEND_API_KEY",
  "MAIL_TIMEOUT_MS",
  "MAIL_FROM",
  "SMTP_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
];

function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of MAIL_KEYS) delete env[key];
  env.NODE_ENV = "test";
  env.JWT_SECRET = "latency-test-secret";
  env.APP_URL = "https://example.invalid";
  env.MAIL_TRANSPORT = "smtp";
  env.RESEND_API_KEY = "";
  env.MAIL_TIMEOUT_MS = "10000";
  env.MAIL_FROM = "Vineyard Manager <mail-test@example.invalid>";
  env.SMTP_URL = "";
  env.SMTP_HOST = "127.0.0.1";
  env.SMTP_PORT = "2525";
  env.SMTP_USER = "";
  env.SMTP_PASS = "";
  return Object.assign(env, extra);
}

function runCase(name: string): Promise<LatencyPayload> {
  const child = spawn(process.execPath, ["--import", "tsx", self], {
    cwd: apiRoot,
    env: childEnv({ LATENCY_CASE: name }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      const line = stdout
        .split(/\r?\n/)
        .find((entry) => entry.startsWith("RESULT "));
      if (code !== 0 || !line) {
        reject(new Error(`scenario ${name} exited ${code}: ${safeFailure(new Error(stderr.slice(0, 300)))}`));
        return;
      }
      const parsed = JSON.parse(line.slice("RESULT ".length)) as LatencyPayload;
      if (stdout.includes("reset-password") || stdout.includes("token=") || stderr.includes("reset-password")) {
        reject(new Error(`scenario ${name} leaked reset material`));
        return;
      }
      resolve(parsed);
    });
  });
}

test("known address reset responds before mail finishes", async () => {
  const result = await runCase("known");
  assert.ok(result.ms < 500);
  assert.equal(result.transactionFinished, true);
  assert.equal(result.transactionBeforeReturn, true);
  assert.equal(result.createCount, 1);
  assert.equal(result.sendCalls, 1);
  assert.equal(result.hasDevResetUrl, true);
  assert.equal(result.generic, false);
  assert.equal(result.unhandled, 0);
  console.info(`latency case=known ms=${result.ms.toFixed(3)}`);
});

test("unknown address reset responds without a transaction", async () => {
  const result = await runCase("unknown");
  assert.ok(result.ms < 500);
  assert.equal(result.generic, true);
  assert.equal(result.hasDevResetUrl, false);
  assert.equal(result.transactionFinished, false);
  assert.equal(result.transactionBeforeReturn, false);
  assert.equal(result.createCount, 0);
  assert.equal(result.sendCalls, 0);
  console.info(`latency case=unknown ms=${result.ms.toFixed(3)}`);
});

test("rejected send does not raise an unhandled rejection", async () => {
  const result = await runCase("reject");
  assert.ok(result.ms < 500);
  assert.equal(result.unhandled, 0);
  assert.equal(result.sendCalls, 1);
  assert.equal(result.createCount, 1);
  assert.equal(result.transactionFinished, true);
  console.info(`latency case=reject ms=${result.ms.toFixed(3)} unhandled=${result.unhandled}`);
});
