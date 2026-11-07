import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";

const scenario = process.env.RESET_LOG_SCENARIO ?? "";
const here = path.dirname(fileURLToPath(import.meta.url));
const self = fileURLToPath(import.meta.url);
const apiRoot = path.resolve(here, "..");

const SENTINEL_TO = "sentinel@example.invalid";
const LOCAL_TO = "sentinel@example.local";
const SENTINEL_URL =
  "https://abidevine.test/reset-password?token=SENTINELTOKEN123";
const FORBIDDEN = [
  "SENTINELTOKEN123",
  "sentinel@example.invalid",
  "sentinel@example.local",
  "abidevine.test",
  "reset-password",
  "Password reset URL",
];
const CODE_SENTINEL = "SENTINELCODE123";

if (scenario) {
  const logs: string[] = [];
  const record = (...parts: unknown[]) => {
    logs.push(parts.map((part) => String(part)).join(" "));
  };
  mock.method(console, "info", record);
  mock.method(console, "error", record);
  mock.method(console, "log", record);
  mock.method(console, "warn", record);
  mock.method(console, "debug", record);

  if (scenario === "sentinel_code") {
    const nodemailer = (await import("nodemailer")).default;
    mock.method(nodemailer, "createTransport", () => ({
      sendMail() {
        const failure = new Error("smtp failure");
        failure.name = CODE_SENTINEL;
        Object.assign(failure, { code: CODE_SENTINEL });
        throw failure;
      },
    }));
  }

  const { sendPasswordResetEmail } = await import("../src/lib/mailer.ts");
  const to = scenario === "local_address" ? LOCAL_TO : SENTINEL_TO;
  const sent = await sendPasswordResetEmail(to, SENTINEL_URL);
  process.stdout.write(`RESULT ${JSON.stringify({ sent, logs })}\n`);
  process.exit(0);
}

type ScenarioResult = { sent: boolean; logs: string[]; stderr: string };

function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toUpperCase().startsWith("SMTP_") || key === "MAIL_FROM") {
      delete env[key];
    }
  }
  env.SMTP_URL = "";
  env.SMTP_HOST = "";
  env.SMTP_USER = "";
  env.SMTP_PASS = "";
  env.MAIL_FROM = "Vineyard Manager <reset-log@example.invalid>";
  env.RESET_LOG_SCENARIO = extra.RESET_LOG_SCENARIO ?? "";
  return Object.assign(env, extra);
}

function runScenario(extra: Record<string, string>): Promise<ScenarioResult> {
  const child = spawn(process.execPath, ["--import", "tsx", self], {
    cwd: apiRoot,
    env: childEnv(extra),
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
        reject(
          new Error(
            `scenario ${extra.RESET_LOG_SCENARIO} exited ${code}: ${stderr.slice(0, 500)}`,
          ),
        );
        return;
      }
      const parsed = JSON.parse(line.slice("RESULT ".length)) as {
        sent: boolean;
        logs: string[];
      };
      resolve({ sent: parsed.sent, logs: parsed.logs, stderr });
    });
  });
}

function assertNoResetMaterial(result: ScenarioResult): void {
  const blob = `${result.logs.join("\n")}\n${result.stderr}`;
  for (const needle of FORBIDDEN) {
    assert.equal(blob.includes(needle), false, `log contained ${needle}`);
  }
}

async function closedPort(): Promise<number> {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("closed-port listener has no port");
  }
  const { port } = address;
  server.close();
  await once(server, "close");
  return port;
}

function listenSink(): Promise<{
  port: number;
  received: () => boolean;
  verbs: () => string[];
  close: () => Promise<void>;
}> {
  let gotData = false;
  const verbs: string[] = [];
  const server = net.createServer((socket) => {
    socket.on("error", () => {});
    socket.setEncoding("utf8");
    socket.write("220 sink.example ESMTP ready\r\n");
    let buffer = "";
    let mode: "cmd" | "data" = "cmd";
    const accept = (chunk: string) => {
      buffer += chunk;
      let progress = true;
      while (progress) {
        progress = false;
        if (mode === "data") {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          gotData = true;
          buffer = buffer.slice(end + 5);
          mode = "cmd";
          socket.write("250 OK\r\n");
          progress = true;
          continue;
        }
        const nl = buffer.indexOf("\r\n");
        if (nl === -1) return;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        progress = true;
        const upper = line.toUpperCase();
        const verb = upper.split(" ")[0] ?? "";
        if (verb) verbs.push(verb);
        if (verb === "EHLO" || verb === "HELO") {
          socket.write("250-sink.example\r\n250-PIPELINING\r\n250-8BITMIME\r\n250 OK\r\n");
        } else if (verb === "DATA") {
          mode = "data";
          socket.write("354 Go ahead\r\n");
        } else if (verb === "QUIT") {
          socket.write("221 Bye\r\n");
        } else {
          socket.write("250 OK\r\n");
        }
      }
    };
    socket.on("data", accept);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("smtp sink has no port"));
        return;
      }
      resolve({
        port: address.port,
        received: () => gotData,
        verbs: () => verbs.slice(),
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

test("password reset log omits material when mail is not configured", async () => {
  const result = await runScenario({ RESET_LOG_SCENARIO: "not_configured" });
  assert.equal(result.sent, false);
  assert.ok(result.logs.some((line) => line.includes("password reset email not sent: not_configured")));
  assertNoResetMaterial(result);
});

test("password reset log omits material for a .local address", async () => {
  const result = await runScenario({
    RESET_LOG_SCENARIO: "local_address",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "9",
  });
  assert.equal(result.sent, false);
  assert.ok(result.logs.some((line) => line.includes("password reset email not sent: local_address")));
  assertNoResetMaterial(result);
});

test("password reset log omits material and raw SMTP errors", async () => {
  const port = await closedPort();
  const result = await runScenario({
    RESET_LOG_SCENARIO: "exception",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(port),
  });
  assert.equal(result.sent, false);
  assert.ok(
    result.logs.some((line) => /^password reset email failed: [A-Za-z0-9_-]+$/.test(line)),
  );
  assertNoResetMaterial(result);
});

test("password reset log drops an alphanumeric error code and name", async () => {
  const result = await runScenario({
    RESET_LOG_SCENARIO: "sentinel_code",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "2525",
  });
  assert.equal(result.sent, false);
  assert.ok(result.logs.some((line) => line === "password reset email failed: unknown"));
  const blob = `${result.logs.join("\n")}\n${result.stderr}`;
  assert.equal(blob.includes(CODE_SENTINEL), false);
  assertNoResetMaterial(result);
});

test("password reset delivery log omits material", async () => {
  const sink = await listenSink();
  try {
    const result = await runScenario({
      RESET_LOG_SCENARIO: "delivered",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(sink.port),
    });
    assert.equal(result.sent, true, `${result.logs.join(" | ")} verbs=${sink.verbs().join(",")}`);
    assert.equal(sink.received(), true, `verbs=${sink.verbs().join(",")}`);
    assertNoResetMaterial(result);
  } finally {
    await sink.close();
  }
});
