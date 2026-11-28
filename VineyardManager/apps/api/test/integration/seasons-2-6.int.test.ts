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

    // 6. Phase 3 — Lock and Reopen (B1–B5, G1)
    await phase3LockAndReopenCases(prisma, base, owner.id, tokens);

    // 7. Phase 4 — User-guide gaps (F1–F7, G1, G3)
    await phase4UserGuideGapsCases(prisma, base, owner.id, manager.id, tokens);
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

async function phase3LockAndReopenCases(
  prisma: PrismaClient,
  base: URL,
  ownerId: string,
  tokens: { power_user: string; manager: string; viewer: string },
): Promise<void> {
  const { reopenSeason } = await import(
    "../../src/modules/seasons/seasons.service.js"
  );

  const v = await createVineyard(prisma, ownerId);
  const row = await prisma.row.create({
    data: {
      vineyardId: v.id,
      code: "R1",
      name: "Row 1",
      variety: "Norton",
      lengthFeet: 80,
      lengthInches: 0,
      vineCount: 16,
      plantedYear: 2021,
    },
  });
  const active2026 = await prisma.season.create({
    data: {
      vineyardId: v.id,
      year: 2026,
      status: "active",
      startedAt: new Date("2026-03-01T18:00:00.000Z"),
    },
  });

  const closedTask = await prisma.task.create({
    data: {
      vineyardId: v.id,
      seasonId: active2026.id,
      rowId: row.id,
      type: "maintenance",
      title: "Season 2026 task",
      body: "",
      dueAt: new Date("2026-06-01T17:00:00.000Z"),
      status: "pending",
    },
  });
  const untaggedTask = await prisma.task.create({
    data: {
      vineyardId: v.id,
      seasonId: null,
      type: "maintenance",
      title: "Untagged task",
      body: "",
      dueAt: new Date("2026-06-01T17:00:00.000Z"),
      status: "pending",
    },
  });
  const closedHarvest = await prisma.harvest.create({
    data: {
      vineyardId: v.id,
      seasonId: active2026.id,
      rowId: row.id,
      harvestedAt: new Date("2026-09-10T17:00:00.000Z"),
      yieldAmount: 50,
      yieldUnit: "lb",
    },
  });
  const closedActivity = await prisma.activity.create({
    data: {
      vineyardId: v.id,
      seasonId: active2026.id,
      rowId: row.id,
      scopeType: "row",
      scopeId: row.id,
      activityType: "watering",
      performedAt: new Date("2026-07-01T17:00:00.000Z"),
      details: { method: "drip" },
      source: "manual",
    },
  });

  // Close 2026 cleanly
  const prevRes = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/vineyards/${v.id}/seasons/${active2026.id}/close-preview`,
    tokens.power_user,
  );
  assert.equal(prevRes.status, 200);
  const previewToken = (prevRes.body as { data: { previewToken: string } }).data
    .previewToken;
  const closeRes = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/vineyards/${v.id}/seasons/${active2026.id}/close`,
    tokens.power_user,
    { previewToken },
  );
  assert.equal(closeRes.status, 200);

  // Create a planned-season task after close (to verify B5: stays in planned after reopen)
  const plannedTaskRes = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/vineyards/${v.id}/tasks`,
    tokens.manager,
    {
      title: "Planned 2027 task",
      body: "",
      dueAt: "2027-03-08",
      type: "maintenance",
      status: "pending",
    },
  );
  assert.equal(plannedTaskRes.status, 201);
  const plannedTaskId = (plannedTaskRes.body as { data: { id: string } }).data.id;
  const planned2027 = await prisma.season.findFirstOrThrow({
    where: { vineyardId: v.id, year: 2027, status: "planned" },
  });

  // B1 & G1: Every write path on a closed-season record returns 409 SEASON_LOCKED for BOTH power_user and manager
  for (const role of ["power_user", "manager"] as const) {
    const patchTask = await httpJson(
      base,
      "PATCH",
      `${API_PREFIX}/vineyards/${v.id}/tasks/${closedTask.id}`,
      tokens[role],
      { status: "acknowledged" },
    );
    assert.equal(patchTask.status, 409, `${role} task PATCH must be 409`);
    assert.equal(
      (patchTask.body as { error?: { code?: string } })?.error?.code,
      "SEASON_LOCKED",
    );

    const delTask = await httpJson(
      base,
      "DELETE",
      `${API_PREFIX}/vineyards/${v.id}/tasks/${closedTask.id}`,
      tokens[role],
    );
    assert.equal(delTask.status, 409, `${role} task DELETE must be 409`);
    assert.equal(
      (delTask.body as { error?: { code?: string } })?.error?.code,
      "SEASON_LOCKED",
    );

    const patchHarvest = await httpJson(
      base,
      "PATCH",
      `${API_PREFIX}/harvests/${closedHarvest.id}`,
      tokens[role],
      { yieldAmount: 99 },
    );
    assert.equal(patchHarvest.status, 409, `${role} harvest PATCH must be 409`);
    assert.equal(
      (patchHarvest.body as { error?: { code?: string } })?.error?.code,
      "SEASON_LOCKED",
    );

    const delHarvest = await httpJson(
      base,
      "DELETE",
      `${API_PREFIX}/harvests/${closedHarvest.id}`,
      tokens[role],
    );
    assert.equal(delHarvest.status, 409, `${role} harvest DELETE must be 409`);
    assert.equal(
      (delHarvest.body as { error?: { code?: string } })?.error?.code,
      "SEASON_LOCKED",
    );

    const delActivity = await httpJson(
      base,
      "DELETE",
      `${API_PREFIX}/activities/${closedActivity.id}`,
      tokens[role],
    );
    assert.equal(delActivity.status, 409, `${role} activity DELETE must be 409`);
    assert.equal(
      (delActivity.body as { error?: { code?: string } })?.error?.code,
      "SEASON_LOCKED",
    );
  }

  // Row delete openTasks=dismiss refuses if an open task exists in a closed season
  const manualClosedOpenTask = await prisma.task.create({
    data: {
      vineyardId: v.id,
      seasonId: active2026.id,
      rowId: row.id,
      type: "maintenance",
      title: "Closed-season open task edge fixture",
      body: "",
      dueAt: new Date("2026-07-01T17:00:00.000Z"),
      status: "pending",
    },
  });
  const rowDelLocked = await httpJson(
    base,
    "DELETE",
    `${API_PREFIX}/vineyards/${v.id}/rows/${row.id}?openTasks=dismiss`,
    tokens.power_user,
  );
  assert.equal(rowDelLocked.status, 409);
  assert.equal(
    (rowDelLocked.body as { error?: { code?: string } })?.error?.code,
    "SEASON_LOCKED",
  );
  // Clean up edge fixture task so row remains clean
  await prisma.task.delete({ where: { id: manualClosedOpenTask.id } });

  // B1: Untagged record (seasonId = null) is NOT locked
  const untaggedPatch = await httpJson(
    base,
    "PATCH",
    `${API_PREFIX}/vineyards/${v.id}/tasks/${untaggedTask.id}`,
    tokens.manager,
    { title: "Updated untagged task" },
  );
  assert.equal(untaggedPatch.status, 200);

  // B4: Manager & viewer get 403 FORBIDDEN on reopen
  for (const role of ["manager", "viewer"] as const) {
    const res = await httpJson(
      base,
      "POST",
      `${API_PREFIX}/vineyards/${v.id}/seasons/${active2026.id}/reopen`,
      tokens[role],
    );
    assert.equal(res.status, 403);
    assert.equal(
      (res.body as { error?: { code?: string } })?.error?.code,
      "FORBIDDEN",
    );
  }

  // B4: Reopen after 30 days -> 409 REOPEN_WINDOW_PASSED (tested with mocked clock, no data deleted)
  const closedSeasonBefore = await prisma.season.findUniqueOrThrow({
    where: { id: active2026.id },
  });
  assert.ok(closedSeasonBefore.closedAt);
  const day31 = new Date(
    closedSeasonBefore.closedAt.getTime() + 31 * 24 * 60 * 60 * 1000,
  );
  await assert.rejects(
    () => reopenSeason(v.id, active2026.id, { now: day31 }),
    (err: unknown) =>
      err instanceof Error &&
      "status" in err &&
      (err as { status: number }).status === 409 &&
      (err as { code: string }).code === "REOPEN_WINDOW_PASSED",
  );
  // Verify season is still closed with snapshot intact
  const stillClosed = await prisma.season.findUniqueOrThrow({
    where: { id: active2026.id },
  });
  assert.equal(stillClosed.status, "closed");
  assert.ok(stillClosed.snapshot);

  // B3: Reopen within 30 days succeeds
  const reopenRes = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/vineyards/${v.id}/seasons/${active2026.id}/reopen`,
    tokens.power_user,
  );
  assert.equal(reopenRes.status, 200);
  const reopenedDb = await prisma.season.findUniqueOrThrow({
    where: { id: active2026.id },
  });
  assert.equal(reopenedDb.status, "active");
  assert.equal(reopenedDb.closedAt, null);
  assert.ok(reopenedDb.reopenedAt);
  assert.equal(reopenedDb.snapshot, null);
  assert.equal(reopenedDb.summary, null);
  assert.ok(
    Array.isArray(reopenedDb.summaryHistory) &&
      reopenedDb.summaryHistory.length === 1,
    "summary must move to summaryHistory on reopen",
  );

  // B3: Dismissed tasks STAY dismissed
  const taskAfterReopen = await prisma.task.findUniqueOrThrow({
    where: { id: closedTask.id },
  });
  assert.equal(taskAfterReopen.status, "dismissed");

  // B5: Planned-season record stays in planned season (not moved)
  const plannedTaskAfterReopen = await prisma.task.findUniqueOrThrow({
    where: { id: plannedTaskId },
  });
  assert.equal(plannedTaskAfterReopen.seasonId, planned2027.id);

  // B3: Second reopen call is an idempotent 200 no-op
  const reopenTwice = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/vineyards/${v.id}/seasons/${active2026.id}/reopen`,
    tokens.power_user,
  );
  assert.equal(reopenTwice.status, 200);
  assert.equal(
    (reopenTwice.body as { data: { alreadyActive?: boolean } }).data.alreadyActive,
    true,
  );

  // Records are now writable again after reopen
  const unlockPatch = await httpJson(
    base,
    "PATCH",
    `${API_PREFIX}/harvests/${closedHarvest.id}`,
    tokens.manager,
    { yieldAmount: 55 },
  );
  assert.equal(unlockPatch.status, 200);
}

async function phase4UserGuideGapsCases(
  prisma: PrismaClient,
  base: URL,
  ownerId: string,
  managerId: string,
  tokens: { power_user: string; manager: string; viewer: string },
): Promise<void> {
  const v = await createVineyard(prisma, ownerId);
  const rowWithHistory = await prisma.row.create({
    data: {
      vineyardId: v.id,
      code: "P4A",
      name: "Phase 4 Row A",
      variety: "Norton",
      lengthFeet: 80,
      lengthInches: 0,
      vineCount: 16,
      plantedYear: 2021,
      status: "fallow",
    },
  });
  const emptyRow = await prisma.row.create({
    data: {
      vineyardId: v.id,
      code: "P4EMPTY",
      name: "Empty Row",
      variety: "Chardonel",
      lengthFeet: 60,
      lengthInches: 0,
      vineCount: 12,
      plantedYear: 2022,
    },
  });

  const closed2025 = await prisma.season.create({
    data: {
      vineyardId: v.id,
      year: 2025,
      status: "closed",
      startedAt: new Date("2025-03-01T18:00:00.000Z"),
      closedAt: new Date("2025-11-15T18:00:00.000Z"),
    },
  });
  const active2026 = await prisma.season.create({
    data: {
      vineyardId: v.id,
      year: 2026,
      status: "active",
      startedAt: new Date("2026-03-01T18:00:00.000Z"),
    },
  });

  // Active-season records
  const weatherActivity = await prisma.activity.create({
    data: {
      vineyardId: v.id,
      seasonId: active2026.id,
      rowId: rowWithHistory.id,
      scopeType: "row",
      scopeId: rowWithHistory.id,
      activityType: "watering",
      performedAt: new Date("2026-06-10T17:00:00.000Z"),
      performedBy: ownerId,
      details: { method: "rain", notes: "Auto rain" },
      source: "weather",
    },
  });
  const activeHarvest = await prisma.harvest.create({
    data: {
      vineyardId: v.id,
      seasonId: active2026.id,
      rowId: rowWithHistory.id,
      harvestedAt: new Date("2026-09-12T17:00:00.000Z"),
      yieldAmount: 42,
      yieldUnit: "lb",
    },
  });
  const activeTask = await prisma.task.create({
    data: {
      vineyardId: v.id,
      seasonId: active2026.id,
      rowId: rowWithHistory.id,
      type: "maintenance",
      title: "Phase 4 live task",
      body: "",
      dueAt: new Date("2026-06-20T17:00:00.000Z"),
      status: "pending",
    },
  });

  // Closed-season records (both live and soft-deleted)
  const closedActivity = await prisma.activity.create({
    data: {
      vineyardId: v.id,
      seasonId: closed2025.id,
      rowId: rowWithHistory.id,
      scopeType: "row",
      scopeId: rowWithHistory.id,
      activityType: "pruning",
      performedAt: new Date("2025-03-10T17:00:00.000Z"),
      details: {},
      source: "manual",
    },
  });
  const closedDeletedActivity = await prisma.activity.create({
    data: {
      vineyardId: v.id,
      seasonId: closed2025.id,
      scopeType: "vineyard",
      scopeId: v.id,
      activityType: "health_observation",
      performedAt: new Date("2025-04-10T17:00:00.000Z"),
      details: {},
      source: "manual",
      deletedAt: new Date("2025-04-11T17:00:00.000Z"),
    },
  });
  const closedDeletedHarvest = await prisma.harvest.create({
    data: {
      vineyardId: v.id,
      seasonId: closed2025.id,
      rowId: rowWithHistory.id,
      harvestedAt: new Date("2025-09-01T17:00:00.000Z"),
      yieldAmount: 15,
      yieldUnit: "lb",
      deletedAt: new Date("2025-09-02T17:00:00.000Z"),
    },
  });
  const closedDeletedTask = await prisma.task.create({
    data: {
      vineyardId: v.id,
      seasonId: closed2025.id,
      type: "maintenance",
      title: "Closed deleted task",
      body: "",
      dueAt: new Date("2025-05-01T17:00:00.000Z"),
      status: "pending",
      deletedAt: new Date("2025-05-02T17:00:00.000Z"),
    },
  });

  // F1 & D-06: Activity PATCH — viewer 403, manager 200 (weather-logged editable, source & performedBy immutable), locked 409
  const viewerPatchAct = await httpJson(
    base,
    "PATCH",
    `${API_PREFIX}/activities/${weatherActivity.id}`,
    tokens.viewer,
    { details: { notes: "Nope" } },
  );
  assert.equal(viewerPatchAct.status, 403);

  const mgrPatchAct = await httpJson(
    base,
    "PATCH",
    `${API_PREFIX}/activities/${weatherActivity.id}`,
    tokens.manager,
    {
      activityType: "health_observation",
      scopeType: "vineyard",
      scopeId: v.id,
      performedAt: "2026-06-11",
      details: { notes: "Edited by manager" },
      source: "manual",
    },
  );
  assert.equal(mgrPatchAct.status, 200);
  const patchedActDb = await prisma.activity.findUniqueOrThrow({
    where: { id: weatherActivity.id },
  });
  assert.equal(patchedActDb.activityType, "health_observation");
  assert.equal(patchedActDb.scopeType, "vineyard");
  assert.equal(patchedActDb.rowId, null);
  assert.equal(patchedActDb.source, "weather", "source must remain immutable");
  assert.equal(
    patchedActDb.performedBy,
    ownerId,
    "performedBy must remain immutable",
  );

  // Closed-season activity PATCH -> 409 SEASON_LOCKED (G1)
  const lockedPatchAct = await httpJson(
    base,
    "PATCH",
    `${API_PREFIX}/activities/${closedActivity.id}`,
    tokens.power_user,
    { details: { notes: "Locked" } },
  );
  assert.equal(lockedPatchAct.status, 409);
  assert.equal(
    (lockedPatchAct.body as { error?: { code?: string } })?.error?.code,
    "SEASON_LOCKED",
  );

  // G3: Season filter on activities, harvests, tasks, metrics
  const actCur = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/vineyards/${v.id}/activities?seasonId=current`,
    tokens.viewer,
  );
  assert.equal(actCur.status, 200);
  assert.equal((actCur.body as { data: unknown[] }).data.length, 1);

  const actAll = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/vineyards/${v.id}/activities?seasonId=all`,
    tokens.viewer,
  );
  assert.equal(actAll.status, 200);
  assert.equal((actAll.body as { data: unknown[] }).data.length, 2);

  const act2025 = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/vineyards/${v.id}/activities?seasonId=${closed2025.id}`,
    tokens.viewer,
  );
  assert.equal(act2025.status, 200);
  assert.equal(
    (act2025.body as { data: Array<{ id: string }> }).data[0]?.id,
    closedActivity.id,
  );

  const metrics2026 = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/vineyards/${v.id}/metrics?period=year&seasonId=${active2026.id}`,
    tokens.viewer,
  );
  assert.equal(metrics2026.status, 200);

  // F2, F3, F4: Delete + ?deleted=only + Restore for activity, harvest, task
  const delAct = await httpJson(
    base,
    "DELETE",
    `${API_PREFIX}/activities/${weatherActivity.id}`,
    tokens.manager,
  );
  assert.equal(delAct.status, 200);
  const deletedActs = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/vineyards/${v.id}/activities?deleted=only`,
    tokens.manager,
  );
  assert.equal(deletedActs.status, 200);
  assert.ok(
    (deletedActs.body as { data: Array<{ id: string }> }).data.some(
      (a) => a.id === weatherActivity.id,
    ),
  );
  const viewerRestoreAct = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/activities/${weatherActivity.id}/restore`,
    tokens.viewer,
  );
  assert.equal(viewerRestoreAct.status, 403);
  const restoreAct = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/activities/${weatherActivity.id}/restore`,
    tokens.manager,
  );
  assert.equal(restoreAct.status, 200);
  assert.equal(
    (await prisma.activity.findUniqueOrThrow({ where: { id: weatherActivity.id } })).deletedAt,
    null,
  );

  // Harvest delete + ?deleted=only + restore
  const delHarv = await httpJson(
    base,
    "DELETE",
    `${API_PREFIX}/harvests/${activeHarvest.id}`,
    tokens.manager,
  );
  assert.equal(delHarv.status, 200);
  const deletedHarvs = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/harvests?vineyardId=${v.id}&deleted=only`,
    tokens.manager,
  );
  assert.equal(deletedHarvs.status, 200);
  assert.ok(
    (deletedHarvs.body as { data: Array<{ id: string }> }).data.some(
      (h) => h.id === activeHarvest.id,
    ),
  );
  const restoreHarv = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/harvests/${activeHarvest.id}/restore`,
    tokens.manager,
  );
  assert.equal(restoreHarv.status, 200);
  assert.equal(
    (await prisma.harvest.findUniqueOrThrow({ where: { id: activeHarvest.id } })).deletedAt,
    null,
  );

  // Task delete + ?deleted=only + restore
  const delTask = await httpJson(
    base,
    "DELETE",
    `${API_PREFIX}/vineyards/${v.id}/tasks/${activeTask.id}`,
    tokens.manager,
  );
  assert.equal(delTask.status, 200);
  const deletedTasks = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/vineyards/${v.id}/tasks?deleted=only`,
    tokens.manager,
  );
  assert.equal(deletedTasks.status, 200);
  assert.ok(
    (deletedTasks.body as { data: Array<{ id: string }> }).data.some(
      (t) => t.id === activeTask.id,
    ),
  );
  const restoreTaskRes = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/vineyards/${v.id}/tasks/${activeTask.id}/restore`,
    tokens.manager,
  );
  assert.equal(restoreTaskRes.status, 200);
  assert.equal(
    (await prisma.task.findUniqueOrThrow({ where: { id: activeTask.id } })).deletedAt,
    null,
  );

  // Closed-season restore must return 409 SEASON_LOCKED for all three
  for (const path of [
    `${API_PREFIX}/activities/${closedDeletedActivity.id}/restore`,
    `${API_PREFIX}/harvests/${closedDeletedHarvest.id}/restore`,
    `${API_PREFIX}/vineyards/${v.id}/tasks/${closedDeletedTask.id}/restore`,
  ]) {
    const res = await httpJson(base, "POST", path, tokens.power_user);
    assert.equal(res.status, 409, `closed-season restore ${path} must be 409`);
    assert.equal(
      (res.body as { error?: { code?: string } })?.error?.code,
      "SEASON_LOCKED",
    );
  }

  // F4 & D-03: Row delete (hard vs soft) + preDeleteCode/preDeleteStatus + ROW_CODE_TAKEN + restore
  const hardDelRow = await httpJson(
    base,
    "DELETE",
    `${API_PREFIX}/vineyards/${v.id}/rows/${emptyRow.id}`,
    tokens.manager,
  );
  assert.equal(hardDelRow.status, 200);
  assert.equal(
    (hardDelRow.body as { data: { mode: string } }).data.mode,
    "hard",
  );
  const restoreHardRow = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/vineyards/${v.id}/rows/${emptyRow.id}/restore`,
    tokens.manager,
  );
  assert.equal(restoreHardRow.status, 404, "hard-deleted row cannot be restored");

  const softDelRow = await httpJson(
    base,
    "DELETE",
    `${API_PREFIX}/vineyards/${v.id}/rows/${rowWithHistory.id}?openTasks=keep`,
    tokens.manager,
  );
  assert.equal(softDelRow.status, 200);
  assert.equal(
    (softDelRow.body as { data: { mode: string } }).data.mode,
    "soft",
  );
  const softDelDb = await prisma.row.findUniqueOrThrow({
    where: { id: rowWithHistory.id },
  });
  assert.equal(softDelDb.preDeleteCode, "P4A");
  assert.equal(softDelDb.preDeleteStatus, "fallow");

  const deletedRows = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/vineyards/${v.id}/rows?deleted=only`,
    tokens.manager,
  );
  assert.equal(deletedRows.status, 200);
  assert.ok(
    (deletedRows.body as { data: Array<{ id: string }> }).data.some(
      (r) => r.id === rowWithHistory.id,
    ),
  );

  // Create conflicting active row with same code "P4A" -> restore gets 409 ROW_CODE_TAKEN
  await prisma.row.create({
    data: {
      vineyardId: v.id,
      code: "P4A",
      name: "Replacement Row",
      variety: "Norton",
      lengthFeet: 80,
      lengthInches: 0,
      vineCount: 16,
      plantedYear: 2026,
    },
  });
  const conflictRestore = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/vineyards/${v.id}/rows/${rowWithHistory.id}/restore`,
    tokens.manager,
    {},
  );
  assert.equal(conflictRestore.status, 409);
  assert.equal(
    (conflictRestore.body as { error?: { code?: string } })?.error?.code,
    "ROW_CODE_TAKEN",
  );

  // Supplying a free code restores the row with its preDeleteStatus ("fallow")
  const renamedRestore = await httpJson(
    base,
    "POST",
    `${API_PREFIX}/vineyards/${v.id}/rows/${rowWithHistory.id}/restore`,
    tokens.manager,
    { code: "P4A-OLD" },
  );
  assert.equal(renamedRestore.status, 200);
  const restoredRowDb = await prisma.row.findUniqueOrThrow({
    where: { id: rowWithHistory.id },
  });
  assert.equal(restoredRowDb.deletedAt, null);
  assert.equal(restoredRowDb.code, "P4A-OLD");
  assert.equal(restoredRowDb.status, "fallow");
  assert.equal(restoredRowDb.preDeleteCode, null);

  // F5: Notification prefs GET/PATCH only affect caller and preserve unknown keys
  await prisma.user.update({
    where: { id: managerId },
    data: { notificationPrefs: { customKeep: 42, weeklyDigest: true } },
  });
  const mgrPrefsBefore = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/auth/me/notification-prefs`,
    tokens.manager,
  );
  assert.equal(mgrPrefsBefore.status, 200);
  assert.equal(
    (mgrPrefsBefore.body as { data: { weeklyDigest: boolean; customKeep: number } })
      .data.weeklyDigest,
    true,
  );
  assert.equal(
    (mgrPrefsBefore.body as { data: { customKeep: number } }).data.customKeep,
    42,
  );

  const mgrPrefsPatch = await httpJson(
    base,
    "PATCH",
    `${API_PREFIX}/auth/me/notification-prefs`,
    tokens.manager,
    { weeklyDigest: false },
  );
  assert.equal(mgrPrefsPatch.status, 200);
  assert.equal(
    (mgrPrefsPatch.body as { data: { weeklyDigest: boolean; customKeep: number } })
      .data.weeklyDigest,
    false,
  );
  assert.equal(
    (mgrPrefsPatch.body as { data: { customKeep: number } }).data.customKeep,
    42,
  );

  // Owner's prefs must be unaffected
  const ownerPrefs = await httpJson(
    base,
    "GET",
    `${API_PREFIX}/auth/me/notification-prefs`,
    tokens.power_user,
  );
  assert.equal(ownerPrefs.status, 200);
  assert.equal(
    (ownerPrefs.body as { data: { weeklyDigest: boolean } }).data.weeklyDigest,
    true,
  );
}



