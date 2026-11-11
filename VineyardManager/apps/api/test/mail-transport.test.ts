import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import { MailTransportError, sendViaResend } from "../src/lib/mail-transports/resend.ts";

const scenario = process.env.MAIL_CASE ?? "";
const here = path.dirname(fileURLToPath(import.meta.url));
const self = fileURLToPath(import.meta.url);
const apiRoot = path.resolve(here, "..");

const FAKE_KEY = "re_test_FAKEKEY_SENTINEL";
const RECIPIENT = "owner@example.invalid";
const SUBJECT = "SUBJECTSENTINEL";
const TOKEN = "TOKENSENTINEL";
const RESET_URL = "https://example.invalid/reset-password?token=TOKENSENTINEL";
const RESPONSE_SENTINEL = "RESPONSE_MESSAGE_SENTINEL";
const SAFE_MESSAGE = /^resend (\d{3}( [a-z_]{1,40})?|timeout|network)$/;
const BLOCKED = [FAKE_KEY, RECIPIENT, SUBJECT, TOKEN, RESET_URL, RESPONSE_SENTINEL, "Bearer "];

function assertSafe(message: string): void {
  assert.match(message, SAFE_MESSAGE);
  for (const needle of BLOCKED) {
    assert.equal(message.includes(needle), false);
  }
}

function headerValue(headers: unknown, name: string): string {
  if (!headers || typeof headers !== "object") return "";
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(name) ?? "";
  }
  if (Array.isArray(headers)) {
    const found = headers.find(
      (entry) => Array.isArray(entry) && String(entry[0]).toLowerCase() === name,
    );
    return found ? String(found[1]) : "";
  }
  const record = headers as Record<string, unknown>;
  const key = Object.keys(record).find((item) => item.toLowerCase() === name);
  return key ? String(record[key]) : "";
}

function safeFailure(error: unknown): string {
  const text = error instanceof Error ? error.message : "scenario failed";
  if (BLOCKED.some((needle) => text.includes(needle))) return "scenario failed";
  return text.slice(0, 300);
}

if (scenario) {
  try {
    const payload = await runChild(scenario);
    process.stdout.write(`RESULT ${JSON.stringify(payload)}\n`);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`${safeFailure(error)}\n`);
    process.exit(1);
  }
}

type FetchCallCheck = {
  fetchCalls: number;
  urlOk: boolean;
  methodOk: boolean;
  authOk: boolean;
  contentTypeOk: boolean;
  toIsArray: boolean;
  htmlOmitted: boolean;
  htmlPresent: boolean;
};

async function runChild(name: string): Promise<Record<string, unknown>> {
  if (name === "config") {
    const { config } = await import("../src/config.ts");
    return {
      mailTransport: config.mailTransport,
      timeout: config.mailTimeoutMs,
      keyMatches: config.resendApiKey === FAKE_KEY,
      keyEmpty: config.resendApiKey === "",
    };
  }

  const warnings: string[] = [];
  const logs: string[] = [];
  mock.method(console, "warn", (...parts: unknown[]) => {
    warnings.push(parts.map((part) => String(part)).join(" "));
  });
  mock.method(console, "error", (...parts: unknown[]) => {
    logs.push(parts.map((part) => String(part)).join(" "));
  });
  mock.method(console, "info", (...parts: unknown[]) => {
    logs.push(parts.map((part) => String(part)).join(" "));
  });

  const checks: FetchCallCheck = {
    fetchCalls: 0,
    urlOk: true,
    methodOk: true,
    authOk: true,
    contentTypeOk: true,
    toIsArray: true,
    htmlOmitted: true,
    htmlPresent: true,
  };
  const statuses = name === "reset_resend" ? [429, 500] : name === "digest_resend" ? [200, 401] : [200];
  mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    checks.fetchCalls += 1;
    checks.urlOk &&= String(input) === "https://api.resend.com/emails";
    checks.methodOk &&= init?.method === "POST";
    checks.authOk &&= headerValue(init?.headers, "authorization") === `Bearer ${process.env.RESEND_API_KEY}`;
    checks.contentTypeOk &&= headerValue(init?.headers, "content-type") === "application/json";
    const raw = typeof init?.body === "string" ? init.body : "";
    let parsed: Record<string, unknown> = {};
    try {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
      }
    } catch {
      checks.toIsArray = false;
    }
    checks.toIsArray &&= Array.isArray(parsed.to);
    const expectHtml = name === "digest_resend" && checks.fetchCalls === 1;
    if (expectHtml) {
      checks.htmlPresent &&= typeof parsed.html === "string";
    } else if (name !== "digest_resend") {
      checks.htmlOmitted &&= !Object.prototype.hasOwnProperty.call(parsed, "html");
    }
    const status = statuses[Math.min(checks.fetchCalls, statuses.length) - 1] ?? 500;
    const body =
      status === 200
        ? { id: "abc", message: RESPONSE_SENTINEL }
        : { name: status === 429 ? "Not A Name" : "Bad Name", message: RESPONSE_SENTINEL, key: FAKE_KEY };
    return new Response(JSON.stringify(body), { status });
  });

  let transportCalls = 0;
  let captured: unknown[] = [];
  const nodemailer = (await import("nodemailer")).default;
  mock.method(nodemailer, "createTransport", (...args: unknown[]) => {
    transportCalls += 1;
    captured = args;
    return {
      async sendMail() {
        return { messageId: "smtp-id" };
      },
    };
  });

  const mailer = await import("../src/lib/mailer.ts");

  if (name === "select_resend" || name === "select_fallback" || name === "select_unconfigured" || name === "select_smtp" || name === "select_bogus") {
    const first = await mailer.sendMail({ to: RECIPIENT, subject: SUBJECT, text: "hello" });
    const second = await mailer.sendMail({ to: RECIPIENT, subject: SUBJECT, text: "hello" });
    return {
      sent: first.sent,
      secondSent: second.sent,
      reason: first.sent ? "" : first.reason,
      messageId: first.sent ? first.messageId : "",
      configured: mailer.isMailConfigured(),
      transportCalls,
      warns: warnings,
      ...checks,
    };
  }

  if (name === "smtp_host" || name === "smtp_url") {
    await mailer.sendMail({ to: RECIPIENT, subject: SUBJECT, text: "hello" });
    return { transportCalls, ...readTimeouts(captured) };
  }

  if (name === "reset_resend") {
    const first = await mailer.sendPasswordResetEmail(RECIPIENT, RESET_URL);
    const second = await mailer.sendPasswordResetEmail(RECIPIENT, RESET_URL);
    return { sent: [first, second], logs, transportCalls, fetchCalls: checks.fetchCalls };
  }

  if (name === "digest_resend") {
    const sent = await mailer.sendMail({
      to: RECIPIENT,
      subject: SUBJECT,
      text: "hello",
      html: "<p>hello</p>",
    });
    let errorText = "";
    try {
      await mailer.sendMail({ to: RECIPIENT, subject: SUBJECT, text: "hello" });
    } catch (error) {
      errorText = mailer.mailErrorMessage(error);
    }
    return {
      sent: sent.sent,
      messageId: sent.sent ? sent.messageId : "",
      errorText,
      transportCalls,
      htmlPresent: checks.htmlPresent,
      fetchCalls: checks.fetchCalls,
    };
  }

  throw new Error("unknown scenario");
}

function readTimeouts(args: unknown[]): {
  connection: number | null;
  greeting: number | null;
  socket: number | null;
  usedUrl: boolean;
  usedHost: boolean;
} {
  let connection: number | null = null;
  let greeting: number | null = null;
  let socket: number | null = null;
  let usedUrl = false;
  let usedHost = false;
  for (const arg of args) {
    if (typeof arg === "string") {
      if (arg.startsWith("smtp")) usedUrl = true;
      continue;
    }
    if (!arg || typeof arg !== "object") continue;
    const record = arg as Record<string, unknown>;
    if (typeof record.connectionTimeout === "number") connection = record.connectionTimeout;
    if (typeof record.greetingTimeout === "number") greeting = record.greetingTimeout;
    if (typeof record.socketTimeout === "number") socket = record.socketTimeout;
    if (typeof record.url === "string") usedUrl = true;
    if (typeof record.host === "string") usedHost = true;
  }
  return { connection, greeting, socket, usedUrl, usedHost };
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

function childEnv(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of MAIL_KEYS) delete env[key];
  env.MAIL_FROM = "Vineyard Manager <mail-test@example.invalid>";
  env.SMTP_URL = "";
  env.SMTP_HOST = "";
  env.SMTP_USER = "";
  env.SMTP_PASS = "";
  env.RESEND_API_KEY = "";
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

function runCase(extra: Record<string, string | undefined>): Promise<{ json: Record<string, unknown>; stderr: string }> {
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
        reject(new Error(`scenario ${extra.MAIL_CASE} exited ${code}: ${safeFailure(new Error(stderr.slice(0, 300)))}`));
        return;
      }
      resolve({ json: JSON.parse(line.slice("RESULT ".length)) as Record<string, unknown>, stderr });
    });
  });
}

function assertClean(blob: string): void {
  for (const needle of BLOCKED) {
    assert.equal(blob.includes(needle), false);
  }
}

const sample = { to: RECIPIENT, subject: SUBJECT, text: `See ${RESET_URL}` };

test("resend adapter posts the expected request shape", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenInit = init;
    return new Response(JSON.stringify({ id: "abc" }), { status: 200 });
  };
  const result = await sendViaResend(sample, {
    apiKey: FAKE_KEY,
    from: "Vineyard <from@example.invalid>",
    timeoutMs: 10_000,
    fetchImpl,
  });
  assert.equal(result.messageId, "abc");
  assert.equal(seenUrl, "https://api.resend.com/emails");
  assert.equal(seenInit?.method, "POST");
  assert.equal(headerValue(seenInit?.headers, "authorization"), `Bearer ${FAKE_KEY}`);
  assert.equal(headerValue(seenInit?.headers, "content-type"), "application/json");
  assert.ok(seenInit?.signal instanceof AbortSignal);
  const body = JSON.parse(String(seenInit?.body)) as Record<string, unknown>;
  assert.deepEqual(body.to, [RECIPIENT]);
  assert.equal(Object.prototype.hasOwnProperty.call(body, "html"), false);

  const withHtml: typeof fetch = async (_input, init) => {
    seenInit = init;
    return new Response(JSON.stringify({ id: "html-id" }), { status: 200 });
  };
  const htmlResult = await sendViaResend(
    { ...sample, html: "<p>hello</p>" },
    { apiKey: FAKE_KEY, from: "Vineyard <from@example.invalid>", timeoutMs: 10_000, fetchImpl: withHtml },
  );
  assert.equal(htmlResult.messageId, "html-id");
  const htmlBody = JSON.parse(String(seenInit?.body)) as Record<string, unknown>;
  assert.equal(htmlBody.html, "<p>hello</p>");

  const empty = await sendViaResend(sample, {
    apiKey: FAKE_KEY,
    from: "Vineyard <from@example.invalid>",
    timeoutMs: 10_000,
    fetchImpl: async () => new Response("not-json", { status: 200 }),
  });
  assert.equal(empty.messageId, "");
});

test("resend adapter maps status codes and non-json bodies", async () => {
  const cases: Array<{ status: number; code: string; body: string | Record<string, unknown>; message: string }> = [
    { status: 401, code: "EAUTH", body: { name: "invalid_api_key", message: RESPONSE_SENTINEL }, message: "resend 401 invalid_api_key" },
    { status: 403, code: "EAUTH", body: { message: RESPONSE_SENTINEL }, message: "resend 403" },
    { status: 400, code: "EMESSAGE", body: { name: "validation_error", message: RESPONSE_SENTINEL }, message: "resend 400 validation_error" },
    { status: 422, code: "EMESSAGE", body: "not-json", message: "resend 422" },
    { status: 429, code: "ERATELIMIT", body: { name: "rate_limit_exceeded", message: RESPONSE_SENTINEL }, message: "resend 429 rate_limit_exceeded" },
    { status: 500, code: "EHTTP", body: "not-json", message: "resend 500" },
    { status: 503, code: "EHTTP", body: { name: "Bad Name", message: RESPONSE_SENTINEL }, message: "resend 503" },
  ];
  for (const item of cases) {
    const error = await sendViaResend(sample, {
      apiKey: FAKE_KEY,
      from: "Vineyard <from@example.invalid>",
      timeoutMs: 10_000,
      fetchImpl: async () =>
        new Response(typeof item.body === "string" ? item.body : JSON.stringify(item.body), { status: item.status }),
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    assert.ok(error instanceof MailTransportError);
    assert.equal(error.code, item.code);
    assert.equal(error.status, item.status);
    assert.equal(error.message, item.message);
    assertSafe(error.message);
  }
});

test("resend adapter maps timeout and connection failures", async () => {
  const abortingFetch: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      const abort = () => {
        const error = new Error("timed out");
        error.name = "TimeoutError";
        reject(error);
      };
      if (!signal) return;
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
    });
  const started = Date.now();
  const timeoutError = await Promise.race([
    sendViaResend(sample, {
      apiKey: FAKE_KEY,
      from: "Vineyard <from@example.invalid>",
      timeoutMs: 50,
      fetchImpl: abortingFetch,
    }).then(
      () => null,
      (caught: unknown) => caught,
    ),
    new Promise<Error>((resolve) => setTimeout(() => resolve(new Error("exceeded")), 1000)),
  ]);
  assert.ok(Date.now() - started < 1000);
  assert.ok(timeoutError instanceof MailTransportError);
  assert.equal(timeoutError.code, "ETIMEDOUT");
  assert.equal(timeoutError.message, "resend timeout");
  assert.equal(timeoutError.status, undefined);
  assertSafe(timeoutError.message);

  const aborted = await sendViaResend(sample, {
    apiKey: FAKE_KEY,
    from: "Vineyard <from@example.invalid>",
    timeoutMs: 10_000,
    fetchImpl: () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    },
  }).then(
    () => null,
    (caught: unknown) => caught,
  );
  assert.ok(aborted instanceof MailTransportError);
  assert.equal(aborted.code, "ETIMEDOUT");
  assert.equal(aborted.message, "resend timeout");
  assertSafe(aborted.message);

  const network = await sendViaResend(sample, {
    apiKey: FAKE_KEY,
    from: "Vineyard <from@example.invalid>",
    timeoutMs: 10_000,
    fetchImpl: () => Promise.reject(new TypeError("network down")),
  }).then(
    () => null,
    (caught: unknown) => caught,
  );
  assert.ok(network instanceof MailTransportError);
  assert.equal(network.code, "ECONNECTION");
  assert.equal(network.message, "resend network");
  assertSafe(network.message);
});

test("resend adapter error messages stay on the safe pattern", async () => {
  const error = await sendViaResend(sample, {
    apiKey: FAKE_KEY,
    from: "Vineyard <from@example.invalid>",
    timeoutMs: 10_000,
    fetchImpl: async () =>
      new Response(JSON.stringify({ name: "Not Safe", message: RESPONSE_SENTINEL, key: FAKE_KEY }), { status: 500 }),
  }).then(
    () => null,
    (caught: unknown) => caught,
  );
  assert.ok(error instanceof MailTransportError);
  assert.equal(error.message, "resend 500");
  assertSafe(error.message);
});

test("mail config parses transport, key, and timeout", async () => {
  const unset = await runCase({ MAIL_CASE: "config", MAIL_TRANSPORT: undefined });
  assert.equal(unset.json.mailTransport, "smtp");
  assert.equal(unset.json.timeout, 10000);
  assert.equal(unset.json.keyEmpty, true);
  assert.equal(unset.json.keyMatches, false);

  const selected = await runCase({
    MAIL_CASE: "config",
    MAIL_TRANSPORT: " ReSeNd ",
    RESEND_API_KEY: `  ${FAKE_KEY}  `,
    MAIL_TIMEOUT_MS: "2500",
  });
  assert.equal(selected.json.mailTransport, "resend");
  assert.equal(selected.json.timeout, 2500);
  assert.equal(selected.json.keyMatches, true);
  assertClean(JSON.stringify(selected.json) + selected.stderr);

  for (const value of ["0", "-5", "nope", "10.5", ""]) {
    const result = await runCase({ MAIL_CASE: "config", MAIL_TIMEOUT_MS: value });
    assert.equal(result.json.timeout, 10000);
  }
  const spaced = await runCase({ MAIL_CASE: "config", MAIL_TIMEOUT_MS: " 2500 " });
  assert.equal(spaced.json.timeout, 2500);
  const bogus = await runCase({ MAIL_CASE: "config", MAIL_TRANSPORT: "bogus" });
  assert.equal(bogus.json.mailTransport, "bogus");
});

test("resend with a key sends through fetch and skips smtp", async () => {
  const result = await runCase({
    MAIL_CASE: "select_resend",
    MAIL_TRANSPORT: "resend",
    RESEND_API_KEY: FAKE_KEY,
  });
  assert.equal(result.json.sent, true);
  assert.equal(result.json.messageId, "abc");
  assert.equal(result.json.configured, true);
  assert.equal(result.json.fetchCalls, 2);
  assert.equal(result.json.transportCalls, 0);
  assert.equal(result.json.urlOk, true);
  assert.equal(result.json.methodOk, true);
  assert.equal(result.json.authOk, true);
  assert.equal(result.json.contentTypeOk, true);
  assert.equal(result.json.toIsArray, true);
  assert.equal(result.json.htmlOmitted, true);
  assert.deepEqual(result.json.warns, []);
  assertClean(JSON.stringify(result.json) + result.stderr);
});

test("resend without a key uses smtp and warns once", async () => {
  const result = await runCase({
    MAIL_CASE: "select_fallback",
    MAIL_TRANSPORT: "resend",
    RESEND_API_KEY: "",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "2525",
  });
  assert.equal(result.json.sent, true);
  assert.equal(result.json.secondSent, true);
  assert.equal(result.json.configured, true);
  assert.equal(result.json.transportCalls, 1);
  assert.equal(result.json.fetchCalls, 0);
  assert.deepEqual(result.json.warns, [
    "mail transport: resend selected but RESEND_API_KEY missing; using smtp",
  ]);
  assertClean(JSON.stringify(result.json) + result.stderr);
});

test("resend without a key or smtp is not configured", async () => {
  const result = await runCase({
    MAIL_CASE: "select_unconfigured",
    MAIL_TRANSPORT: "resend",
    RESEND_API_KEY: "",
    SMTP_HOST: "",
    SMTP_URL: "",
  });
  assert.equal(result.json.sent, false);
  assert.equal(result.json.reason, "not_configured");
  assert.equal(result.json.configured, false);
  assert.equal(result.json.transportCalls, 0);
  assert.equal(result.json.fetchCalls, 0);
  assert.deepEqual(result.json.warns, [
    "mail transport: resend selected but RESEND_API_KEY missing; not configured",
  ]);
  assertClean(JSON.stringify(result.json) + result.stderr);
});

test("unset or non-resend transport uses smtp and does not call fetch", async () => {
  const unset = await runCase({
    MAIL_CASE: "select_smtp",
    MAIL_TRANSPORT: undefined,
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "2525",
  });
  assert.equal(unset.json.sent, true);
  assert.equal(unset.json.configured, true);
  assert.equal(unset.json.fetchCalls, 0);
  assert.equal(unset.json.transportCalls, 1);
  assert.deepEqual(unset.json.warns, []);

  const bogus = await runCase({
    MAIL_CASE: "select_bogus",
    MAIL_TRANSPORT: "bogus",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "2525",
  });
  assert.equal(bogus.json.sent, true);
  assert.equal(bogus.json.configured, true);
  assert.equal(bogus.json.fetchCalls, 0);
  assert.equal(bogus.json.transportCalls, 1);
  assert.deepEqual(bogus.json.warns, []);
});

test("smtp transport sets connection greeting and socket timeouts", async () => {
  const host = await runCase({
    MAIL_CASE: "smtp_host",
    MAIL_TRANSPORT: "smtp",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "2525",
  });
  assert.equal(host.json.transportCalls, 1);
  assert.equal(host.json.connection, 10000);
  assert.equal(host.json.greeting, 10000);
  assert.equal(host.json.socket, 20000);
  assert.equal(host.json.usedHost, true);

  const url = await runCase({
    MAIL_CASE: "smtp_url",
    MAIL_TRANSPORT: "smtp",
    SMTP_URL: "smtp://127.0.0.1:2525",
  });
  assert.equal(url.json.transportCalls, 1);
  assert.equal(url.json.connection, 10000);
  assert.equal(url.json.greeting, 10000);
  assert.equal(url.json.socket, 20000);
  assert.equal(url.json.usedUrl, true);
});

test("password reset logs resend rate limit and http failures", async () => {
  const result = await runCase({
    MAIL_CASE: "reset_resend",
    MAIL_TRANSPORT: "resend",
    RESEND_API_KEY: FAKE_KEY,
  });
  assert.deepEqual(result.json.sent, [false, false]);
  assert.deepEqual(result.json.logs, [
    "password reset email failed: ERATELIMIT",
    "password reset email failed: EHTTP",
  ]);
  assert.equal(result.json.transportCalls, 0);
  assert.equal(result.json.fetchCalls, 2);
  assertClean(`${JSON.stringify(result.json)}\n${result.stderr}`);
});

test("digest sendMail uses resend and keeps error text safe", async () => {
  const result = await runCase({
    MAIL_CASE: "digest_resend",
    MAIL_TRANSPORT: "resend",
    RESEND_API_KEY: FAKE_KEY,
  });
  assert.equal(result.json.sent, true);
  assert.equal(result.json.messageId, "abc");
  assert.equal(result.json.errorText, "resend 401");
  assert.equal(result.json.transportCalls, 0);
  assert.equal(result.json.htmlPresent, true);
  assert.equal(result.json.fetchCalls, 2);
  assert.match(String(result.json.errorText), SAFE_MESSAGE);
  assertClean(`${JSON.stringify(result.json)}\n${result.stderr}`);
});
