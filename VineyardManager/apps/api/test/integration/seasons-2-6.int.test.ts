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

    // 5. Phase 2 — Close Season (A2–A9)
    await phase2CloseSeasonCases(prisma, base, owner.id, tokens);
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

async function phase2CloseSeasonCases(
  prisma: PrismaClient,
  base: URL,
  ownerId: string,
  tokens: { power_user: string; manager: string; viewer: string },
): Promise<void> {
  const { runScheduledDigest } = await import(
    "../../src/modules/digest/digest.send.js"
  );

  // Two vineyards so we prove other vineyard is untouched (A7)
  const v1 = await createVineyard(prisma, ownerId);
  const v2 = await createVineyard(prisma, ownerId);

  const row1 = await prisma.row.create({
    data: {
      vineyardId: v1.id,
      code: "L1",
      name: "Line 1",
      variety: "Norton",
      lengthFeet: 100,
      lengthInches: 0,
      vineCount: 20,
      plantedYear: 2020,
    },
  });

  const s1Active = await prisma.season.create({
    data: {
      vineyardId: v1.id,
      year: 2026,
      status: "active",
      startedAt: new Date("2026-03-01T18:00:00.000Z"),
    },
  });
  const s2Active = await prisma.season.create({
    data: {
      vineyardId: v2.id,
      year: 2026,
      status: "active",
      startedAt: new Date("2026-03-01T18:00:00.000Z"),
    },
  });

  // Tasks in v1/s1Active: 1 pending, 1 sent, 1 acknowledged, 1 dismissed, 1 soft-deleted, 1 untagged
  const tPending = await prisma.task.create({
    data: {
      vineyardId: v1.id,
      seasonId: s1Active.id,
      rowId: row1.id,
      type: "maintenance",
      title: "Open pending task",
      body: "",
      dueAt: new Date("2026-09-15T17:00:00.000Z"),
      status: "pending",
    },
  });
  const tSent = await prisma.task.create({
    data: {
      vineyardId: v1.id,
      seasonId: s1Active.id,
      type: "maintenance",
      title: "Open in-progress task",
      body: "",
      dueAt: new Date("2026-10-15T17:00:00.000Z"),
      status: "sent",
    },
  });
  const tAck = await prisma.task.create({
    data: {
      vineyardId: v1.id,
      seasonId: s1Active.id,
      type: "maintenance",
      title: "Completed task",
      body: "",
      dueAt: new Date("2026-04-01T17:00:00.000Z"),
      status: "acknowledged",
    },
  });
  const tDeleted = await prisma.task.create({
    data: {
      vineyardId: v1.id,
      seasonId: s1Active.id,
      type: "maintenance",
      title: "Soft-deleted open task",
      body: "",
      dueAt: new Date("2026-05-01T17:00:00.000Z"),
      status: "pending",
      deletedAt: new Date("2026-05-02T17:00:00.000Z"),
    },
  });
  const tUntagged = await prisma.task.create({
    data: {
      vineyardId: v1.id,
      seasonId: null,
      type: "maintenance",
      title: "Untagged task",
      body: "",
      dueAt: new Date("2026-06-01T17:00:00.000Z"),
      status: "pending",
    },
  });
  // Task in other vineyard v2 must remain untouched
  const tOtherVineyard = await prisma.task.create({
    data: {
      vineyardId: v2.id,
      seasonId: s2Active.id,
      type: "maintenance",
      title: "Other vineyard task",
      body: "",
      dueAt: new Date("2026-09-01T17:00:00.000Z"),
      status: "pending",
    },
  });

  await prisma.harvest.create({
    data: {
      vineyardId: v1.id,
      seasonId: s1Active.id,
      rowId: row1.id,
      harvestedAt: new Date("2026-09-12T17:00:00.000Z"),
      yieldAmount: 125.5,
      yieldUnit: "lb",
    },
  });

  await prisma.activity.create({
    data: {
      vineyardId: v1.id,
      seasonId: s1Active.id,
      scopeType: "vineyard",
      scopeId: v1.id,
      activityType: "watering",
      performedAt: new Date("2026-07-10T17:00:00.000Z"),
      details: { method: "drip" },
      source: "manual",
    },
  });

  // A4: manager and viewer get 403 FORBIDDEN on close-preview and close
  for (const role of ["manager", "viewer"] as const) {
    const prevRes = await httpJson(
      base,
      "GET",
      `${API_PREFIX}/vineyards/${v1.id}/seasons/${s1Active.id}/close-preview`,
      tokens[role],
    );
    assert.equal(prevRes.status, 403, `${role} must get 403 on close-preview`);
    assert.equal(
      (prevRes.body as { error?: { code?: string } })?.error?.code,
      "FORBIDDEN",
    );

    const closeRes = await httpJson(
      base,
      "POST",
      `${API_PREFIX}/vineyards/${v1.id}/seasons/${s1Active.id}/close`,
      tokens[role],
      { previewToken: "fake" },
    );
    assert.equal(closeRes.status, 403, `${role} must get 403 on close`);
    assert.equal(
      (closeRes.body as { error?: { code?: string } })?.error?.code,
      "FORBIDDEN",
    );
  }

  // A2: Power user gets close preview
  const prevRes = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/vineyards/${v1.id}/seasons/${s1Active.id}/close-preview`,
    tokens.power_user,
  );
  assert.equal(prevRes.status, 200);
  const preview = (prevRes.body as {
    data: {
      openTaskCount: number;
      untaggedOpenTaskCount: number;
      harvests: { totalLb: number };
      work: { waterings: number };
      previewToken: string;
    };
  }).data;
  assert.equal(preview.openTaskCount, 2);
  assert.equal(preview.untaggedOpenTaskCount, 1);
  assert.equal(preview.harvests.totalLb, 125.5);
  assert.equal(preview.work.waterings, 1);
  assert.ok(preview.previewToken.length >= 32);

  // A5: Mutate state after preview -> close returns 409 PREVIEW_STALE with fresh counts, nothing changes
  await prisma.activity.create({
    data: {
      vineyardId: v1.id,
      seasonId: s1Active.id,
      scopeType: "vineyard",
      scopeId: v1.id,
      activityType: "weed_prevention",
      performedAt: new Date("2026-07-12T17:00:00.000Z"),
      details: { method: "manual" },
      source: "manual",
    },
  });
  const staleRes = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/vineyards/${v1.id}/seasons/${s1Active.id}/close`,
    tokens.power_user,
    { previewToken: preview.previewToken },
  );
  assert.equal(staleRes.status, 409);
  assert.equal(
    (staleRes.body as { error?: { code?: string } })?.error?.code,
    "PREVIEW_STALE",
  );
  const freshPreview = (staleRes.body as {
    data: { work: { weedTreatments: number }; previewToken: string };
  }).data;
  assert.equal(freshPreview.work.weedTreatments, 1);
  assert.notEqual(freshPreview.previewToken, preview.previewToken);

  // Confirm season is still active and tasks untouched after stale 409
  const stillActive = await prisma.season.findUniqueOrThrow({
    where: { id: s1Active.id },
  });
  assert.equal(stillActive.status, "active");
  assert.equal(stillActive.closeVersion, 0);

  // A3 & A6: Two concurrent close calls with the fresh token -> exactly ONE 200 and ONE 409 SEASON_NOT_ACTIVE
  const [closeA, closeB] = await Promise.all([
    httpJson(
      base,
      "POST",
      `${API_PREFIX}/vineyards/${v1.id}/seasons/${s1Active.id}/close`,
      tokens.power_user,
      { previewToken: freshPreview.previewToken },
    ),
    httpJson(
      base,
      "POST",
      `${API_PREFIX}/vineyards/${v1.id}/seasons/${s1Active.id}/close`,
      tokens.power_user,
      { previewToken: freshPreview.previewToken },
    ),
  ]);
  const statuses = [closeA.status, closeB.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 409]);
  const failedConcurrent = closeA.status === 409 ? closeA : closeB;
  assert.equal(
    (failedConcurrent.body as { error?: { code?: string } })?.error?.code,
    "SEASON_NOT_ACTIVE",
  );

  // Verify DB state after close
  const closedSeason = await prisma.season.findUniqueOrThrow({
    where: { id: s1Active.id },
  });
  assert.equal(closedSeason.status, "closed");
  assert.equal(closedSeason.closeVersion, 1);
  assert.ok(closedSeason.closedAt);
  assert.equal(closedSeason.closedBy, ownerId);
  assert.ok(closedSeason.snapshot);
  assert.ok(closedSeason.summary);

  const [pAfter, sAfter, aAfter, dAfter, uAfter, oAfter] = await Promise.all([
    prisma.task.findUniqueOrThrow({ where: { id: tPending.id } }),
    prisma.task.findUniqueOrThrow({ where: { id: tSent.id } }),
    prisma.task.findUniqueOrThrow({ where: { id: tAck.id } }),
    prisma.task.findUniqueOrThrow({ where: { id: tDeleted.id } }),
    prisma.task.findUniqueOrThrow({ where: { id: tUntagged.id } }),
    prisma.task.findUniqueOrThrow({ where: { id: tOtherVineyard.id } }),
  ]);
  assert.equal(pAfter.status, "dismissed");
  assert.equal(sAfter.status, "dismissed");
  assert.equal(aAfter.status, "acknowledged");
  assert.equal(dAfter.status, "pending"); // soft-deleted untouched
  assert.equal(uAfter.status, "pending"); // untagged untouched (D-13)
  assert.equal(oAfter.status, "pending"); // other vineyard untouched (A7)

  // A7: Closing already-closed season -> 409 SEASON_NOT_ACTIVE
  const closeAgain = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/vineyards/${v1.id}/seasons/${s1Active.id}/close`,
    tokens.power_user,
    { previewToken: freshPreview.previewToken },
  );
  assert.equal(closeAgain.status, 409);
  assert.equal(
    (closeAgain.body as { error?: { code?: string } })?.error?.code,
    "SEASON_NOT_ACTIVE",
  );

  // A8: Dormant health returns neutral dormant state & scheduled digest skips dormant vineyard
  const healthRes = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/vineyards/${v1.id}/health`,
    tokens.viewer,
  );
  assert.equal(healthRes.status, 200);
  const healthBody = (healthRes.body as {
    data: { dormant?: boolean; dormantSince?: string | null; overall: { score: number } };
  }).data;
  assert.equal(healthBody.dormant, true);
  assert.ok(healthBody.dormantSince);
  assert.equal(healthBody.overall.score, 100);

  const digestRes = await runScheduledDigest(v1.id, new Date("2026-11-16T12:00:00.000Z"));
  assert.equal(digestRes.dormant, true);
  assert.equal(digestRes.sent, 0);
  assert.equal(
    await prisma.digestLog.count({ where: { vineyardId: v1.id } }),
    0,
  );

  // A9: New task, harvest, and activity after close land in planned season (2027), never closed 2026
  const newTaskRes = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/vineyards/${v1.id}/tasks`,
    tokens.manager,
    {
      title: "Post-close task",
      body: "Winter prep",
      dueAt: "2026-12-01",
      type: "maintenance",
      status: "pending",
    },
  );
  assert.equal(newTaskRes.status, 201);
  const newHarvestRes = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/harvests`,
    tokens.manager,
    {
      rowId: row1.id,
      harvestedAt: "2026-11-20",
      yieldAmount: 10,
      yieldUnit: "lb",
    },
  );
  assert.equal(newHarvestRes.status, 201);
  const newActivityRes = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/vineyards/${v1.id}/activities`,
    tokens.manager,
    {
      scopeType: "vineyard",
      scopeId: v1.id,
      activityType: "pruning",
      performedAt: "2026-12-05",
      details: {},
      source: "manual",
    },
  );
  assert.equal(newActivityRes.status, 201);

  const planned2027 = await prisma.season.findFirst({
    where: { vineyardId: v1.id, year: 2027, status: "planned" },
  });
  assert.ok(planned2027, "post-close writes must create planned season 2027");

  const createdTaskId = (newTaskRes.body as { data: { id: string } }).data.id;
  const createdHarvestId = (newHarvestRes.body as { data: { id: string } }).data.id;
  const createdActivityId = (newActivityRes.body as { data: { id: string } }).data.id;

  assert.equal(
    (await prisma.task.findUniqueOrThrow({ where: { id: createdTaskId } })).seasonId,
    planned2027.id,
  );
  assert.equal(
    (await prisma.harvest.findUniqueOrThrow({ where: { id: createdHarvestId } })).seasonId,
    planned2027.id,
  );
  assert.equal(
    (await prisma.activity.findUniqueOrThrow({ where: { id: createdActivityId } })).seasonId,
    planned2027.id,
  );
}

