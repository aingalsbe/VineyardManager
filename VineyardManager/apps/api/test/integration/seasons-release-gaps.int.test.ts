/// <reference path="../../src/types/express.d.ts" />
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, request as httpRequest, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { ANNUAL_CALENDAR_TEMPLATES, API_PREFIX } from "@vineyard/shared";
import { test } from "node:test";
import { FORBIDDEN_MESSAGE } from "../../src/modules/auth/auth.middleware.js";
import { signAccessToken } from "../../src/modules/auth/tokens.js";
import { createApp } from "../../src/app.js";
import { runSeasonTransaction } from "../../src/modules/seasons/season-routing.js";
import { RAIN_THRESHOLD_INCHES } from "../../src/modules/weather/weather.service.js";
import { assertDisposableSeasonDatabase } from "../../scripts/backfill-seasons.ts";

function requiredDatabaseUrl(): string {
  const url = process.env.SEASONS_TEST_DATABASE_URL;
  assert.ok(url, "SEASONS_TEST_DATABASE_URL is required");
  return url;
}

const databaseUrl = requiredDatabaseUrl();
const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "../..");
const THRESHOLDS = { greenMin: 80, yellowMin: 70, orangeMin: 60 };
const FORECAST_ORIGIN = "https://api.open-meteo.com";
const FORECAST_PATH = "/v1/forecast";

let activeChild: ChildProcess | null = null;

type ChildCounts = {
  seasons: number;
  tasks: number;
  harvests: number;
  activities: number;
};

type HttpResult = { status: number; body: unknown };

type FetchLog = { forecast: number; unexpected: number };

const fetchLog: FetchLog = { forecast: 0, unexpected: 0 };

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

function withUrlParam(url: string, key: string, value: string): string {
  const hashAt = url.indexOf("#");
  const beforeFragment = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? "" : url.slice(hashAt);
  const separator = beforeFragment.includes("?") ? "&" : "?";
  return `${beforeFragment}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${fragment}`;
}

function assertNoSecrets(stdout: string, stderr: string): void {
  const blob = `${stdout}\n${stderr}`;
  assert.equal(blob.includes(databaseUrl), false);
  const secret = process.env.JWT_SECRET;
  if (secret) assert.equal(blob.includes(secret), false);
  assert.equal(blob.includes("postgres://"), false);
  assert.equal(blob.includes("postgresql://"), false);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForClose(child: ChildProcess, ms: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onClose = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.removeListener("close", onClose);
      resolve(false);
    }, Math.max(0, ms));
    child.once("close", onClose);
  });
}

function collectOutput(child: ChildProcess): { stdout: () => string; stderr: () => string } {
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  return {
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

function spawnApplyCli(applicationName: string): ChildProcess {
  return spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/backfill-seasons.ts",
      "--apply",
      "--database-url-env",
      "SEASONS_TEST_DATABASE_URL",
    ],
    {
      cwd: apiRoot,
      env: {
        ...process.env,
        SEASONS_TEST_DATABASE_URL: withUrlParam(databaseUrl, "application_name", applicationName),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

async function runApplyCli(
  applicationName: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawnApplyCli(applicationName);
  activeChild = child;
  const collected = collectOutput(child);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("backfill cli timed out"));
      }, 60_000);
      child.once("error", (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode);
      });
    });
    const stdout = collected.stdout();
    const stderr = collected.stderr();
    assertNoSecrets(stdout, stderr);
    return { code, stdout, stderr };
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await waitForClose(child, 5_000);
    }
    activeChild = null;
  }
}

function tagCountSum(stdout: string): number {
  let sum = 0;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.includes("reason=tag")) continue;
    const match = /count=(\d+)/.exec(line);
    sum += match ? Number(match[1]) : 0;
  }
  return sum;
}

async function isNamedBackendBlocked(
  looker: PrismaClient,
  holderPid: number,
  applicationName: string,
): Promise<boolean> {
  const rows = await looker.$queryRaw<Array<{ name: string | null }>>`
    SELECT a.application_name AS name
    FROM pg_stat_activity a
    WHERE a.datname = current_database()
      AND a.pid <> pg_backend_pid()
      AND a.application_name = ${applicationName}
      AND CAST(${holderPid} AS int) = ANY (pg_blocking_pids(a.pid))
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Stock CLI, batch size 200. A holder on the target row keeps the tag UPDATE
 * uncommitted so SIGKILL is a real process kill. maxTagBatches is not used.
 */
async function killApplyWhileHeld(
  holder: PrismaClient,
  looker: PrismaClient,
  applicationName: string,
  lockTaskId: string,
  ready: () => Promise<boolean>,
): Promise<void> {
  await holder.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "tasks" WHERE "id" = CAST(${lockTaskId} AS uuid) FOR UPDATE
      `;
      assert.equal(locked.length, 1);
      const pidRows = await tx.$queryRaw<Array<{ pid: number }>>`
        SELECT pg_backend_pid() AS pid
      `;
      const holderPid = Number(pidRows[0]?.pid);
      assert.equal(Number.isInteger(holderPid) && holderPid > 0, true);
      const child = spawnApplyCli(applicationName);
      activeChild = child;
      const collected = collectOutput(child);
      try {
        const deadline = Date.now() + 25_000;
        let opened = false;
        while (!opened) {
          const blocked = await isNamedBackendBlocked(looker, holderPid, applicationName);
          if (blocked && (await ready())) opened = true;
          else if (Date.now() >= deadline) {
            throw new Error("timed out waiting for the backfill backend to block");
          } else {
            await delay(20);
          }
        }
        child.kill("SIGKILL");
        assert.equal(await waitForClose(child, 10_000), true);
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await waitForClose(child, 5_000);
        }
        activeChild = null;
        assertNoSecrets(collected.stdout(), collected.stderr());
      }
    },
    { maxWait: 5_000, timeout: 45_000 },
  );
}

type FetchInput = Parameters<typeof fetch>[0];

function requestHref(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function installFetchMock(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = async (input: FetchInput) => {
    let allowed = false;
    try {
      const url = new URL(requestHref(input));
      allowed =
        url.origin === FORECAST_ORIGIN &&
        url.pathname === FORECAST_PATH &&
        url.searchParams.get("hourly") === "precipitation";
    } catch {
      allowed = false;
    }
    if (!allowed) {
      fetchLog.unexpected += 1;
      throw new Error("unmocked fetch");
    }
    fetchLog.forecast += 1;
    return new Response(JSON.stringify({ hourly: { time: [], precipitation: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return () => {
    globalThis.fetch = original;
  };
}

function errorCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function errorMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

function dataField(body: unknown, key: string): unknown {
  if (typeof body !== "object" || body === null) return undefined;
  const data = (body as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return undefined;
  return (data as Record<string, unknown>)[key];
}

function postJson(
  base: URL,
  requestPath: string,
  json: unknown,
  authorization: string | null,
): Promise<HttpResult> {
  const payload = Buffer.from(JSON.stringify(json));
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "content-length": String(payload.length),
    };
    if (authorization) headers.authorization = authorization;
    const req = httpRequest(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port,
        path: requestPath,
        method: "POST",
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
    req.on("error", reject);
    req.end(payload);
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
      email: `gaps-${label}-${stamp}@example.invalid`,
      passwordHash: "fixture",
      displayName: "Season fixture",
      role,
      notificationPrefs: {},
    },
  });
}

async function createVineyard(
  prisma: PrismaClient,
  ownerId: string,
  timeZone: string,
  located = false,
) {
  return prisma.vineyard.create({
    data: {
      ownerId,
      name: "Season fixture",
      address: "fixture",
      timezone: timeZone,
      healthThresholds: THRESHOLDS,
      ...(located ? { lat: "38.627000", lng: "-90.199000" } : {}),
    },
  });
}

async function createRow(prisma: PrismaClient, vineyardId: string) {
  return prisma.row.create({
    data: {
      vineyardId,
      code: "L1",
      name: "L1",
      variety: "Norton",
      lengthFeet: 10,
      lengthInches: 0,
      vineCount: 1,
      plantedYear: 2020,
    },
  });
}

function taskInput(vineyardId: string, title: string, dueAt: Date, seasonId?: string) {
  return {
    vineyardId,
    type: "maintenance" as const,
    title,
    body: "fixture",
    dueAt,
    status: "pending" as const,
    ...(seasonId ? { seasonId } : {}),
  };
}

async function counts(prisma: PrismaClient, vineyardId: string): Promise<ChildCounts> {
  const [seasons, tasks, harvests, activities] = await Promise.all([
    prisma.season.count({ where: { vineyardId } }),
    prisma.task.count({ where: { vineyardId } }),
    prisma.harvest.count({ where: { vineyardId } }),
    prisma.activity.count({ where: { vineyardId } }),
  ]);
  return { seasons, tasks, harvests, activities };
}

async function assertCounts(prisma: PrismaClient, vineyardId: string, expected: ChildCounts): Promise<void> {
  assert.deepEqual(await counts(prisma, vineyardId), expected);
}

function taskBody(): unknown {
  return {
    title: "Prune row",
    body: "fixture",
    dueAt: "2026-03-08",
    type: "maintenance",
    status: "pending",
  };
}

function harvestBody(rowId: string): unknown {
  return { rowId, harvestedAt: "2026-09-10", yieldAmount: 4, yieldUnit: "lb" };
}

function activityBody(vineyardId: string): unknown {
  return {
    scopeType: "vineyard",
    scopeId: vineyardId,
    activityType: "watering",
    performedAt: "2026-07-15",
    details: {},
    source: "manual",
  };
}

function bearer(token: string): string {
  return `Bearer ${token}`;
}

async function taskSeasonId(prisma: PrismaClient, taskId: string): Promise<string | null> {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { seasonId: true },
  });
  return task.seasonId;
}

async function uniqueSeasonYears(prisma: PrismaClient, vineyardId: string): Promise<void> {
  const seasons = await prisma.season.findMany({
    where: { vineyardId },
    select: { year: true },
  });
  const years = seasons.map((season) => season.year);
  assert.equal(new Set(years).size, years.length);
}

function isRestrictError(error: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null || seen.has(value)) return false;
    seen.add(value);
    const record = value as { code?: unknown; cause?: unknown; meta?: unknown };
    if (record.code === "P2003" || record.code === "23503") return true;
    return walk(record.meta) || walk(record.cause);
  };
  return walk(error);
}

async function dropGapFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS seasons_gaps_fail_nth_task ON tasks");
  await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS seasons_gaps_fail_nth_task()");
  await prisma.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS seasons_gaps_fail_first_activity ON activities",
  );
  await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS seasons_gaps_fail_first_activity()");
  await prisma.$executeRawUnsafe("DROP SEQUENCE IF EXISTS seasons_gaps_activity_fail_seq");
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
    const ids = vineyards.map((vineyard) => vineyard.id);
    if (ids.length > 0) {
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

type ArrivalGate = {
  arrive: () => Promise<void>;
  count: () => number;
  release: () => void;
};

function createArrivalGate(): ArrivalGate {
  let arrived = 0;
  let release = () => {};
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    async arrive() {
      arrived += 1;
      await opened;
    },
    count: () => arrived,
    release,
  };
}

function barrierClient(gate: ArrivalGate, closedOnly: boolean): PrismaClient {
  const extended = new PrismaClient({ datasources: { db: { url: databaseUrl } } }).$extends({
    query: {
      season: {
        async findMany({ args, query }) {
          const result = await query(args);
          const rows = Array.isArray(result) ? result : [];
          const closed =
            rows.length > 0 &&
            rows.every((row) => {
              return (
                typeof row === "object" &&
                row !== null &&
                (row as { status?: unknown }).status === "closed"
              );
            });
          if ((closedOnly && closed) || (!closedOnly && rows.length === 0)) {
            await gate.arrive();
          }
          return result;
        },
      },
    },
  });
  return extended as unknown as PrismaClient;
}

function p2002Client(failTimes: number): { client: PrismaClient; calls: () => number } {
  let calls = 0;
  const extended = new PrismaClient({ datasources: { db: { url: databaseUrl } } }).$extends({
    query: {
      season: {
        async createMany({ args, query }) {
          calls += 1;
          if (calls <= failTimes) {
            throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
              code: "P2002",
              clientVersion: "test",
            });
          }
          return query(args);
        },
      },
    },
  });
  return { client: extended as unknown as PrismaClient, calls: () => calls };
}

async function disconnectQuietly(client: PrismaClient): Promise<void> {
  await client.$disconnect();
}

test("season release gaps for http, auth, collision, kill, restrict, schedule, and weather", async () => {
  assertHttpDatabase();
  requireJwtSecret();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const holder = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const userIds: string[] = [];
  let ownerId: string | null = null;
  let guarded = false;
  let restoreFetch: (() => void) | null = null;
  let server: Server | null = null;
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
    guarded = true;
    await dropGapFixtures(prisma);
    restoreFetch = installFetchMock();

    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server?.once("error", reject);
      server?.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (address == null || typeof address === "string") {
      throw new Error("loopback port missing");
    }
    const base = new URL(`http://127.0.0.1:${address.port}`);

    const owner = await createUser(prisma, stamp, "power_user", "owner");
    ownerId = owner.id;
    userIds.push(owner.id);
    const viewer = await createUser(prisma, stamp, "viewer", "viewer");
    const manager = await createUser(prisma, stamp, "manager", "manager");
    const power = await createUser(prisma, stamp, "power_user", "power");
    userIds.push(viewer.id, manager.id, power.id);
    const viewerToken = signAccessToken(viewer);
    const managerToken = signAccessToken(manager);
    const powerToken = signAccessToken(power);

    await killCases(prisma, holder, owner.id);
    await collisionCases(prisma, owner.id);
    await rollbackCase(prisma, owner.id);
    await invalidTimezoneCases(prisma, base, owner.id, powerToken);
    await powerUserWriters(prisma, base, owner.id, powerToken);
    await roleCases(prisma, base, owner.id, viewerToken, managerToken, powerToken);
    await restrictCases(prisma, owner.id);
    await scheduleAndWeatherCases(prisma, base, owner.id, powerToken);
    assert.equal(fetchLog.unexpected, 0);
  } finally {
    if (activeChild && activeChild.exitCode === null && activeChild.signalCode === null) {
      activeChild.kill("SIGKILL");
      await waitForClose(activeChild, 5_000);
      activeChild = null;
    }
    restoreFetch?.();
    try {
      if (guarded) await dropGapFixtures(prisma);
      if (ownerId || userIds.length > 0) await cleanup(prisma, ownerId, userIds);
    } finally {
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server?.close((error) => (error ? reject(error) : resolve()));
        });
      }
      await prisma.$disconnect();
      await holder.$disconnect();
    }
  }
});

async function killCases(
  prisma: PrismaClient,
  holder: PrismaClient,
  ownerId: string,
): Promise<void> {
  await uncommittedKill(prisma, holder, ownerId);
  await afterCommitKill(prisma, holder, ownerId);
}

async function uncommittedKill(
  prisma: PrismaClient,
  holder: PrismaClient,
  ownerId: string,
): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const task = await prisma.task.create({
    data: taskInput(vineyard.id, "uncommitted", new Date("2019-06-01T12:00:00.000Z")),
  });
  await killApplyWhileHeld(
    holder,
    prisma,
    `gapsu${Math.random().toString(16).slice(2, 8)}`,
    task.id,
    async () => (await taskSeasonId(prisma, task.id)) == null,
  );
  assert.equal(await taskSeasonId(prisma, task.id), null);

  const resume = await runApplyCli(`gapsur${Math.random().toString(16).slice(2, 8)}`);
  assert.equal(resume.code, 0);
  assert.equal(tagCountSum(resume.stdout), 1);
  const tagged = await taskSeasonId(prisma, task.id);
  assert.ok(tagged);
  await uniqueSeasonYears(prisma, vineyard.id);

  const third = await runApplyCli(`gapsut${Math.random().toString(16).slice(2, 8)}`);
  assert.equal(third.code, 0);
  assert.equal(tagCountSum(third.stdout), 0);
  assert.equal(third.stdout.includes("reason=tag"), false);
  assert.equal(await taskSeasonId(prisma, task.id), tagged);
}

async function afterCommitKill(
  prisma: PrismaClient,
  holder: PrismaClient,
  ownerId: string,
): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const preassignedSeason = await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2018, status: "legacy" },
  });
  const preassigned = await prisma.task.create({
    data: taskInput(
      vineyard.id,
      "preassigned",
      new Date("2018-06-01T12:00:00.000Z"),
      preassignedSeason.id,
    ),
  });
  const early = await prisma.task.create({
    data: taskInput(vineyard.id, "early", new Date("2019-06-01T12:00:00.000Z")),
  });
  const late = await prisma.task.create({
    data: taskInput(vineyard.id, "late", new Date("2020-06-01T12:00:00.000Z")),
  });
  await killApplyWhileHeld(
    holder,
    prisma,
    `gapsc${Math.random().toString(16).slice(2, 8)}`,
    late.id,
    async () => {
      const earlyId = await taskSeasonId(prisma, early.id);
      const lateId = await taskSeasonId(prisma, late.id);
      return earlyId != null && lateId == null;
    },
  );
  const earlyAfterKill = await taskSeasonId(prisma, early.id);
  assert.ok(earlyAfterKill);
  assert.equal(await taskSeasonId(prisma, late.id), null);
  assert.equal(await taskSeasonId(prisma, preassigned.id), preassignedSeason.id);

  const resume = await runApplyCli(`gapscr${Math.random().toString(16).slice(2, 8)}`);
  assert.equal(resume.code, 0);
  assert.equal(tagCountSum(resume.stdout), 1);
  assert.equal(await taskSeasonId(prisma, early.id), earlyAfterKill);
  assert.ok(await taskSeasonId(prisma, late.id));
  assert.equal(await taskSeasonId(prisma, preassigned.id), preassignedSeason.id);
  await uniqueSeasonYears(prisma, vineyard.id);

  const third = await runApplyCli(`gapsct${Math.random().toString(16).slice(2, 8)}`);
  assert.equal(third.code, 0);
  assert.equal(tagCountSum(third.stdout), 0);
  assert.equal(third.stdout.includes("reason=tag"), false);
  assert.equal(await taskSeasonId(prisma, preassigned.id), preassignedSeason.id);
}

async function collisionCases(prisma: PrismaClient, ownerId: string): Promise<void> {
  await emptySeasonBarrier(prisma, ownerId);
  await closedSeasonBarrier(prisma, ownerId);
  await p2002Once(prisma, ownerId);
  await p2002Twice(prisma, ownerId);
  await callbackP2002Once(prisma, ownerId);
  await callbackP2002Twice(prisma, ownerId);
}

async function writeBarrierTask(
  client: PrismaClient,
  vineyardId: string,
  title: string,
): Promise<void> {
  await runSeasonTransaction(client, vineyardId, (tx, seasonId) =>
    tx.task.create({ data: taskInput(vineyardId, title, new Date("2024-06-01T12:00:00.000Z"), seasonId) }),
  );
}

async function emptySeasonBarrier(prisma: PrismaClient, ownerId: string): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const gate = createArrivalGate();
  const first = barrierClient(gate, false);
  const second = barrierClient(gate, false);
  const writes = Promise.all([
    writeBarrierTask(first, vineyard.id, "barrier-a"),
    writeBarrierTask(second, vineyard.id, "barrier-b"),
  ]);
  try {
    await waitForGate(gate, writes);
    gate.release();
    await writes;
  } finally {
    gate.release();
    await Promise.allSettled([writes]);
    await disconnectQuietly(first);
    await disconnectQuietly(second);
  }
  const tasks = await prisma.task.findMany({
    where: { vineyardId: vineyard.id },
    select: { seasonId: true },
  });
  const seasons = await prisma.season.findMany({
    where: { vineyardId: vineyard.id },
    select: { id: true, status: true, year: true },
  });
  assert.equal(tasks.length, 2);
  assert.equal(seasons.length, 1);
  assert.equal(seasons[0]?.status, "active");
  assert.equal(tasks[0]?.seasonId, seasons[0]?.id);
  assert.equal(tasks[1]?.seasonId, seasons[0]?.id);
}

async function closedSeasonBarrier(prisma: PrismaClient, ownerId: string): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2024, status: "closed" },
  });
  const gate = createArrivalGate();
  const first = barrierClient(gate, true);
  const second = barrierClient(gate, true);
  const writes = Promise.all([
    writeBarrierTask(first, vineyard.id, "closed-a"),
    writeBarrierTask(second, vineyard.id, "closed-b"),
  ]);
  try {
    await waitForGate(gate, writes);
    gate.release();
    await writes;
  } finally {
    gate.release();
    await Promise.allSettled([writes]);
    await disconnectQuietly(first);
    await disconnectQuietly(second);
  }
  const tasks = await prisma.task.findMany({
    where: { vineyardId: vineyard.id },
    select: { seasonId: true },
  });
  const planned = await prisma.season.findMany({
    where: { vineyardId: vineyard.id, status: "planned" },
  });
  assert.equal(tasks.length, 2);
  assert.equal(planned.length, 1);
  assert.equal(planned[0]?.year, 2025);
  assert.equal(tasks[0]?.seasonId, planned[0]?.id);
  assert.equal(tasks[1]?.seasonId, planned[0]?.id);
  await uniqueSeasonYears(prisma, vineyard.id);
}

async function waitForGate(gate: ArrivalGate, writes: Promise<unknown>): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (gate.count() < 2) {
    const settled = await Promise.race([
      writes.then(
        () => "done" as const,
        () => "failed" as const,
      ),
      delay(10).then(() => "wait" as const),
    ]);
    if (settled !== "wait") {
      throw new Error("season findMany barrier not reached");
    }
    if (Date.now() >= deadline) {
      throw new Error("season findMany barrier not reached");
    }
  }
}

async function p2002Once(prisma: PrismaClient, ownerId: string): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const injected = p2002Client(1);
  try {
    await runSeasonTransaction(injected.client, vineyard.id, (tx, seasonId) =>
      tx.task.create({
        data: taskInput(vineyard.id, "p2002-once", new Date("2024-06-01T12:00:00.000Z"), seasonId),
      }),
    );
  } finally {
    await disconnectQuietly(injected.client);
  }
  assert.equal(injected.calls(), 2);
  await assertCounts(prisma, vineyard.id, { seasons: 1, tasks: 1, harvests: 0, activities: 0 });
}

async function p2002Twice(prisma: PrismaClient, ownerId: string): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const injected = p2002Client(2);
  try {
    await assert.rejects(
      () =>
        runSeasonTransaction(injected.client, vineyard.id, (tx, seasonId) =>
          tx.task.create({
            data: taskInput(vineyard.id, "p2002-twice", new Date("2024-06-01T12:00:00.000Z"), seasonId),
          }),
        ),
      (error: unknown) => {
        assert.equal(
          typeof error === "object" && error !== null && (error as { code?: unknown }).code,
          "P2002",
        );
        return true;
      },
    );
  } finally {
    await disconnectQuietly(injected.client);
  }
  assert.equal(injected.calls(), 2);
  await assertCounts(prisma, vineyard.id, { seasons: 0, tasks: 0, harvests: 0, activities: 0 });
}

async function callbackP2002Once(prisma: PrismaClient, ownerId: string): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  let runs = 0;
  await runSeasonTransaction(prisma, vineyard.id, async (tx, seasonId) => {
    runs += 1;
    await tx.task.create({
      data: taskInput(vineyard.id, "callback-once", new Date("2024-06-01T12:00:00.000Z"), seasonId),
    });
    if (runs === 1) throw Object.assign(new Error("unique"), { code: "P2002" });
  });
  assert.equal(runs, 2);
  await assertCounts(prisma, vineyard.id, { seasons: 1, tasks: 1, harvests: 0, activities: 0 });
}

async function callbackP2002Twice(prisma: PrismaClient, ownerId: string): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  let runs = 0;
  await assert.rejects(async () => {
    await runSeasonTransaction(prisma, vineyard.id, async (tx, seasonId) => {
      runs += 1;
      await tx.task.create({
        data: taskInput(vineyard.id, "callback-twice", new Date("2024-06-01T12:00:00.000Z"), seasonId),
      });
      throw Object.assign(new Error("unique"), { code: "P2002" });
    });
  });
  assert.equal(runs, 2);
  await assertCounts(prisma, vineyard.id, { seasons: 0, tasks: 0, harvests: 0, activities: 0 });
}

async function rollbackCase(prisma: PrismaClient, ownerId: string): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  await assert.rejects(async () => {
    await runSeasonTransaction(prisma, vineyard.id, async (tx, seasonId) => {
      await tx.task.create({
        data: taskInput(vineyard.id, "rollback", new Date("2024-06-01T12:00:00.000Z"), seasonId),
      });
      throw new Error("fixture rollback");
    });
  });
  await assertCounts(prisma, vineyard.id, { seasons: 0, tasks: 0, harvests: 0, activities: 0 });
}

async function invalidTimezoneCases(
  prisma: PrismaClient,
  base: URL,
  ownerId: string,
  token: string,
): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "Not/AZone", true);
  const row = await createRow(prisma, vineyard.id);
  const before = await prisma.vineyard.findUniqueOrThrow({
    where: { id: vineyard.id },
    select: { lat: true, lng: true },
  });
  const forecastBefore = fetchLog.forecast;
  const routes: Array<{ path: string; json: unknown }> = [
    { path: `${API_PREFIX}/vineyards/${vineyard.id}/tasks`, json: taskBody() },
    { path: `${API_PREFIX}/harvests`, json: harvestBody(row.id) },
    { path: `${API_PREFIX}/vineyards/${vineyard.id}/activities`, json: activityBody(vineyard.id) },
    { path: `${API_PREFIX}/vineyards/${vineyard.id}/schedule/seed`, json: {} },
    {
      path: `${API_PREFIX}/vineyards/${vineyard.id}/weather/daily-check`,
      json: { forceRainInches: 1 },
    },
  ];
  for (const route of routes) {
    const response = await postJson(base, route.path, route.json, bearer(token));
    assert.equal(response.status, 409);
    assert.equal(errorCode(response.body), "SEASON_SETUP_REQUIRED");
  }
  assert.equal(fetchLog.forecast, forecastBefore);
  await assertCounts(prisma, vineyard.id, { seasons: 0, tasks: 0, harvests: 0, activities: 0 });
  const after = await prisma.vineyard.findUniqueOrThrow({
    where: { id: vineyard.id },
    select: { lat: true, lng: true },
  });
  assert.equal(after.lat?.toString(), before.lat?.toString());
  assert.equal(after.lng?.toString(), before.lng?.toString());
}

async function powerUserWriters(
  prisma: PrismaClient,
  base: URL,
  ownerId: string,
  token: string,
): Promise<void> {
  await expectCreatedTask(prisma, base, ownerId, token);
  await expectCreatedHarvest(prisma, base, ownerId, token);
  await expectCreatedActivity(prisma, base, ownerId, token);
  await expectCreatedSchedule(prisma, base, ownerId, token);
  const forecastBefore = fetchLog.forecast;
  const weather = await createVineyard(prisma, ownerId, "UTC", true);
  const response = await postJson(
    base,
    `${API_PREFIX}/vineyards/${weather.id}/weather/daily-check`,
    { forceRainInches: 1 },
    bearer(token),
  );
  assert.equal(response.status, 201);
  assert.equal(fetchLog.forecast - forecastBefore, 1);
  const activities = await prisma.activity.findMany({ where: { vineyardId: weather.id } });
  assert.equal(activities.length, 1);
  assert.equal(activities[0]?.source, "weather");
  assert.equal(activities[0]?.activityType, "watering");
  assert.ok(activities[0]?.seasonId);
  await assertCounts(prisma, weather.id, { seasons: 1, tasks: 0, harvests: 0, activities: 1 });
}

async function expectCreatedTask(
  prisma: PrismaClient,
  base: URL,
  ownerId: string,
  token: string,
): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const response = await postJson(
    base,
    `${API_PREFIX}/vineyards/${vineyard.id}/tasks`,
    taskBody(),
    bearer(token),
  );
  assert.equal(response.status, 201);
  const tasks = await prisma.task.findMany({ where: { vineyardId: vineyard.id } });
  assert.equal(tasks.length, 1);
  assert.ok(tasks[0]?.seasonId);
  await assertCounts(prisma, vineyard.id, { seasons: 1, tasks: 1, harvests: 0, activities: 0 });
}

async function expectCreatedHarvest(
  prisma: PrismaClient,
  base: URL,
  ownerId: string,
  token: string,
): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const row = await createRow(prisma, vineyard.id);
  const response = await postJson(base, `${API_PREFIX}/harvests`, harvestBody(row.id), bearer(token));
  assert.equal(response.status, 201);
  const harvests = await prisma.harvest.findMany({ where: { vineyardId: vineyard.id } });
  assert.equal(harvests.length, 1);
  assert.ok(harvests[0]?.seasonId);
  await assertCounts(prisma, vineyard.id, { seasons: 1, tasks: 0, harvests: 1, activities: 0 });
}

async function expectCreatedActivity(
  prisma: PrismaClient,
  base: URL,
  ownerId: string,
  token: string,
): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const response = await postJson(
    base,
    `${API_PREFIX}/vineyards/${vineyard.id}/activities`,
    activityBody(vineyard.id),
    bearer(token),
  );
  assert.equal(response.status, 201);
  const activities = await prisma.activity.findMany({ where: { vineyardId: vineyard.id } });
  assert.equal(activities.length, 1);
  assert.ok(activities[0]?.seasonId);
  await assertCounts(prisma, vineyard.id, { seasons: 1, tasks: 0, harvests: 0, activities: 1 });
}

async function expectCreatedSchedule(
  prisma: PrismaClient,
  base: URL,
  ownerId: string,
  token: string,
): Promise<void> {
  assert.equal(ANNUAL_CALENDAR_TEMPLATES.length, 8);
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const response = await postJson(
    base,
    `${API_PREFIX}/vineyards/${vineyard.id}/schedule/seed`,
    {},
    bearer(token),
  );
  assert.equal(response.status, 201);
  assert.equal(dataField(response.body, "created"), 8);
  const tasks = await prisma.task.findMany({
    where: { vineyardId: vineyard.id },
    select: { seasonId: true },
  });
  assert.equal(tasks.length, 8);
  const seasonIds = new Set(tasks.map((task) => task.seasonId));
  assert.equal(seasonIds.size, 1);
  assert.ok([...seasonIds][0]);
  await assertCounts(prisma, vineyard.id, { seasons: 1, tasks: 8, harvests: 0, activities: 0 });
}

async function roleCases(
  prisma: PrismaClient,
  base: URL,
  ownerId: string,
  viewerToken: string,
  managerToken: string,
  powerToken: string,
): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC", true);
  const row = await createRow(prisma, vineyard.id);
  const routes: Array<{ path: string; json: unknown }> = [
    { path: `${API_PREFIX}/vineyards/${vineyard.id}/tasks`, json: taskBody() },
    { path: `${API_PREFIX}/harvests`, json: harvestBody(row.id) },
    { path: `${API_PREFIX}/vineyards/${vineyard.id}/activities`, json: activityBody(vineyard.id) },
    { path: `${API_PREFIX}/vineyards/${vineyard.id}/schedule/seed`, json: {} },
    {
      path: `${API_PREFIX}/vineyards/${vineyard.id}/weather/daily-check`,
      json: { forceRainInches: 1 },
    },
  ];
  const forecastBefore = fetchLog.forecast;
  for (const route of routes) {
    const missing = await postJson(base, route.path, route.json, null);
    assert.equal(missing.status, 401);
    assert.equal(errorCode(missing.body), "UNAUTHORIZED");
    const basic = await postJson(base, route.path, route.json, "Basic abc");
    assert.equal(basic.status, 401);
    assert.equal(errorCode(basic.body), "UNAUTHORIZED");
    const bad = await postJson(base, route.path, route.json, "Bearer not-a-token");
    assert.equal(bad.status, 401);
    assert.equal(errorCode(bad.body), "UNAUTHORIZED");
    const denied = await postJson(base, route.path, route.json, bearer(viewerToken));
    assert.equal(denied.status, 403);
    assert.equal(errorCode(denied.body), "FORBIDDEN");
    assert.equal(errorMessage(denied.body), FORBIDDEN_MESSAGE);
  }
  assert.equal(fetchLog.forecast, forecastBefore);
  await assertCounts(prisma, vineyard.id, { seasons: 0, tasks: 0, harvests: 0, activities: 0 });

  await expectCreatedTask(prisma, base, ownerId, managerToken);
  await expectCreatedHarvest(prisma, base, ownerId, managerToken);
  await expectCreatedActivity(prisma, base, ownerId, managerToken);
  const managerWeather = await createVineyard(prisma, ownerId, "UTC", true);
  const weatherBefore = fetchLog.forecast;
  const weather = await postJson(
    base,
    `${API_PREFIX}/vineyards/${managerWeather.id}/weather/daily-check`,
    { forceRainInches: 1 },
    bearer(managerToken),
  );
  assert.equal(weather.status, 201);
  assert.equal(fetchLog.forecast - weatherBefore, 1);
  await assertCounts(prisma, managerWeather.id, { seasons: 1, tasks: 0, harvests: 0, activities: 1 });

  const deniedSeed = await createVineyard(prisma, ownerId, "UTC");
  const seed = await postJson(
    base,
    `${API_PREFIX}/vineyards/${deniedSeed.id}/schedule/seed`,
    {},
    bearer(managerToken),
  );
  assert.equal(seed.status, 403);
  assert.equal(errorMessage(seed.body), FORBIDDEN_MESSAGE);
  await assertCounts(prisma, deniedSeed.id, { seasons: 0, tasks: 0, harvests: 0, activities: 0 });

  const crossA = await createVineyard(prisma, ownerId, "UTC");
  const crossB = await createVineyard(prisma, ownerId, "UTC");
  const rowB = await createRow(prisma, crossB.id);
  const cross = await postJson(
    base,
    `${API_PREFIX}/vineyards/${crossA.id}/tasks`,
    { ...(taskBody() as Record<string, unknown>), rowId: rowB.id },
    bearer(powerToken),
  );
  assert.equal(cross.status, 400);
  assert.equal(errorCode(cross.body), "VALIDATION_ERROR");
  await assertCounts(prisma, crossA.id, { seasons: 0, tasks: 0, harvests: 0, activities: 0 });
  await assertCounts(prisma, crossB.id, { seasons: 0, tasks: 0, harvests: 0, activities: 0 });
}

async function restrictCases(prisma: PrismaClient, ownerId: string): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const other = await createVineyard(prisma, ownerId, "UTC");
  const row = await createRow(prisma, vineyard.id);
  const taskSeason = await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2021, status: "legacy" },
  });
  const harvestSeason = await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2022, status: "legacy" },
  });
  const activitySeason = await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2023, status: "legacy" },
  });
  const freeSeason = await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2020, status: "legacy" },
  });
  const task = await prisma.task.create({
    data: taskInput(vineyard.id, "restrict-task", new Date("2021-06-01T12:00:00.000Z"), taskSeason.id),
  });
  const harvest = await prisma.harvest.create({
    data: {
      vineyardId: vineyard.id,
      rowId: row.id,
      seasonId: harvestSeason.id,
      harvestedAt: new Date("2022-09-01T12:00:00.000Z"),
      yieldAmount: "4.00",
      yieldUnit: "lb",
    },
  });
  const activity = await prisma.activity.create({
    data: {
      vineyardId: vineyard.id,
      seasonId: activitySeason.id,
      scopeType: "vineyard",
      scopeId: vineyard.id,
      activityType: "watering",
      performedAt: new Date("2023-07-01T12:00:00.000Z"),
      details: {},
      source: "manual",
    },
  });
  const untagged = await prisma.task.create({
    data: taskInput(vineyard.id, "untagged-child", new Date("2024-06-01T12:00:00.000Z")),
  });
  assert.equal(untagged.seasonId, null);

  for (const seasonId of [taskSeason.id, harvestSeason.id, activitySeason.id]) {
    await assert.rejects(
      () => prisma.season.delete({ where: { id: seasonId } }),
      (error: unknown) => {
        assert.equal(isRestrictError(error), true);
        return true;
      },
    );
  }
  assert.equal(await taskSeasonId(prisma, task.id), taskSeason.id);
  const harvestRow = await prisma.harvest.findUniqueOrThrow({
    where: { id: harvest.id },
    select: { seasonId: true },
  });
  const activityRow = await prisma.activity.findUniqueOrThrow({
    where: { id: activity.id },
    select: { seasonId: true },
  });
  assert.equal(harvestRow.seasonId, harvestSeason.id);
  assert.equal(activityRow.seasonId, activitySeason.id);

  const replacementId = "00000000-0000-4000-8000-000000000099";
  await assert.rejects(
    () =>
      prisma.$executeRaw`
        UPDATE "seasons"
        SET "id" = CAST(${replacementId} AS uuid)
        WHERE "id" = CAST(${taskSeason.id} AS uuid)
      `,
    (error: unknown) => {
      assert.equal(isRestrictError(error), true);
      return true;
    },
  );
  await assert.rejects(
    () =>
      prisma.$executeRaw`
        UPDATE "seasons"
        SET "vineyard_id" = CAST(${other.id} AS uuid)
        WHERE "id" = CAST(${taskSeason.id} AS uuid)
      `,
    (error: unknown) => {
      assert.equal(isRestrictError(error), true);
      return true;
    },
  );
  const stillThere = await prisma.season.findUniqueOrThrow({
    where: { id: taskSeason.id },
    select: { id: true, vineyardId: true },
  });
  assert.equal(stillThere.id, taskSeason.id);
  assert.equal(stillThere.vineyardId, vineyard.id);
  assert.equal(await taskSeasonId(prisma, task.id), taskSeason.id);

  await prisma.season.delete({ where: { id: freeSeason.id } });
  assert.equal(await prisma.season.count({ where: { id: freeSeason.id } }), 0);
  assert.equal(await taskSeasonId(prisma, untagged.id), null);
}

async function scheduleAndWeatherCases(
  prisma: PrismaClient,
  base: URL,
  ownerId: string,
  token: string,
): Promise<void> {
  const seeded = await createVineyard(prisma, ownerId, "UTC");
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION seasons_gaps_fail_nth_task() RETURNS trigger
    LANGUAGE plpgsql AS $$
    DECLARE
      existing integer;
    BEGIN
      SELECT count(*) INTO existing FROM tasks WHERE vineyard_id = NEW.vineyard_id;
      IF existing >= 2 THEN
        RAISE EXCEPTION 'seasons_gaps_task_insert_limit';
      END IF;
      RETURN NEW;
    END;
    $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER seasons_gaps_fail_nth_task
    BEFORE INSERT ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION seasons_gaps_fail_nth_task();
  `);
  try {
    const failed = await postJson(
      base,
      `${API_PREFIX}/vineyards/${seeded.id}/schedule/seed`,
      {},
      bearer(token),
    );
    assert.equal(failed.status, 500);
    assert.equal(errorCode(failed.body), "INTERNAL_ERROR");
    await assertCounts(prisma, seeded.id, { seasons: 0, tasks: 0, harvests: 0, activities: 0 });
  } finally {
    await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS seasons_gaps_fail_nth_task ON tasks");
    await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS seasons_gaps_fail_nth_task()");
  }
  const retried = await postJson(
    base,
    `${API_PREFIX}/vineyards/${seeded.id}/schedule/seed`,
    {},
    bearer(token),
  );
  assert.equal(retried.status, 201);
  assert.equal(dataField(retried.body, "created"), 8);
  const tasks = await prisma.task.findMany({
    where: { vineyardId: seeded.id },
    select: { seasonId: true, title: true },
  });
  assert.equal(tasks.length, 8);
  assert.equal(new Set(tasks.map((task) => task.title)).size, 8);
  assert.equal(new Set(tasks.map((task) => task.seasonId)).size, 1);
  await assertCounts(prisma, seeded.id, { seasons: 1, tasks: 8, harvests: 0, activities: 0 });

  const weather = await createVineyard(prisma, ownerId, "UTC", true);
  const firstBefore = fetchLog.forecast;
  const first = await postJson(
    base,
    `${API_PREFIX}/vineyards/${weather.id}/weather/daily-check`,
    { forceRainInches: 1 },
    bearer(token),
  );
  assert.ok(1 > RAIN_THRESHOLD_INCHES);
  assert.equal(first.status, 201);
  assert.equal(fetchLog.forecast - firstBefore, 1);
  const secondBefore = fetchLog.forecast;
  const second = await postJson(
    base,
    `${API_PREFIX}/vineyards/${weather.id}/weather/daily-check`,
    { forceRainInches: 1 },
    bearer(token),
  );
  assert.equal(second.status, 200);
  assert.equal(dataField(second.body, "skippedReason"), "already_logged_today");
  assert.equal(dataField(second.body, "activityCreated"), false);
  assert.equal(fetchLog.forecast - secondBefore, 1);
  await assertCounts(prisma, weather.id, { seasons: 1, tasks: 0, harvests: 0, activities: 1 });

  const retryVineyard = await createVineyard(prisma, ownerId, "UTC", true);
  await prisma.$executeRawUnsafe("CREATE SEQUENCE seasons_gaps_activity_fail_seq");
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION seasons_gaps_fail_first_activity() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.source = 'weather' AND nextval('seasons_gaps_activity_fail_seq') = 1 THEN
        RAISE EXCEPTION 'seasons_gaps_unique' USING ERRCODE = '23505';
      END IF;
      RETURN NEW;
    END;
    $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER seasons_gaps_fail_first_activity
    BEFORE INSERT ON activities
    FOR EACH ROW
    EXECUTE FUNCTION seasons_gaps_fail_first_activity();
  `);
  try {
    const retryBefore = fetchLog.forecast;
    const retriedWeather = await postJson(
      base,
      `${API_PREFIX}/vineyards/${retryVineyard.id}/weather/daily-check`,
      { forceRainInches: 1 },
      bearer(token),
    );
    assert.equal(retriedWeather.status, 201);
    assert.equal(fetchLog.forecast - retryBefore, 1);
    await assertCounts(prisma, retryVineyard.id, {
      seasons: 1,
      tasks: 0,
      harvests: 0,
      activities: 1,
    });
  } finally {
    await prisma.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS seasons_gaps_fail_first_activity ON activities",
    );
    await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS seasons_gaps_fail_first_activity()");
    await prisma.$executeRawUnsafe("DROP SEQUENCE IF EXISTS seasons_gaps_activity_fail_seq");
  }
  assert.equal(fetchLog.unexpected, 0);
}
