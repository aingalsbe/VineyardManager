import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  buildVineyardMetrics,
  calendarDateInZone,
  yieldToLb,
  type YieldUnit,
} from "@vineyard/shared";
import { test } from "node:test";
import { HttpError } from "../../src/middleware/error-handler.js";
import { runSeasonTransaction } from "../../src/modules/seasons/season-routing.js";
import {
  assertDisposableSeasonDatabase,
  backfillCompletion,
  formatBackfillLine,
  runBackfill,
  tagBatch,
  type BackfillLine,
  type TagPlan,
} from "../../scripts/backfill-seasons.ts";

function requiredDatabaseUrl(): string {
  const url = process.env.SEASONS_TEST_DATABASE_URL;
  assert.ok(url, "SEASONS_TEST_DATABASE_URL is required");
  return url;
}

const databaseUrl = requiredDatabaseUrl();
const testApplicationNames = new Set<string>();

function registerWorkerName(name: string): string {
  testApplicationNames.add(name);
  return name;
}

/** Append application_name without printing the connection URL. */
function withApplicationName(url: string, name: string): string {
  const hashAt = url.indexOf("#");
  const beforeFragment = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? "" : url.slice(hashAt);
  const separator = beforeFragment.includes("?") ? "&" : "?";
  return `${beforeFragment}${separator}application_name=${encodeURIComponent(name)}${fragment}`;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "../..");
const THRESHOLDS = { greenMin: 80, yellowMin: 70, orangeMin: 60 };

function roundLb(value: number): number {
  return Math.round(value * 100) / 100;
}

function localYear(date: Date, timeZone: string): number {
  return Number(calendarDateInZone(date, timeZone).slice(0, 4));
}

async function createUser(prisma: PrismaClient, stamp: string) {
  return prisma.user.create({
    data: {
      email: `seasons-step1-${stamp}@example.invalid`,
      passwordHash: "fixture",
      displayName: "Season fixture",
      role: "power_user",
      notificationPrefs: {},
    },
  });
}

async function createVineyard(
  prisma: PrismaClient,
  ownerId: string,
  timeZone: string,
  deletedAt?: Date,
) {
  return prisma.vineyard.create({
    data: {
      ownerId,
      name: "Season fixture",
      address: "fixture",
      timezone: timeZone,
      healthThresholds: THRESHOLDS,
      deletedAt: deletedAt ?? null,
    },
  });
}

async function createRow(prisma: PrismaClient, vineyardId: string, code: string, deletedAt?: Date) {
  return prisma.row.create({
    data: {
      vineyardId,
      code,
      name: code,
      variety: "Norton",
      lengthFeet: 10,
      lengthInches: 0,
      vineCount: 1,
      plantedYear: 2020,
      deletedAt: deletedAt ?? null,
    },
  });
}

function taskData(
  vineyardId: string,
  dueAt: Date,
  extra: Partial<Prisma.TaskUncheckedCreateInput> = {},
): Prisma.TaskUncheckedCreateInput {
  return {
    vineyardId,
    type: "maintenance",
    title: "fixture",
    body: "fixture",
    dueAt,
    status: "pending",
    ...extra,
  };
}

async function cleanup(prisma: PrismaClient, userId: string): Promise<void> {
  const vineyards = await prisma.vineyard.findMany({
    where: { ownerId: userId },
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
  await prisma.user.delete({ where: { id: userId } });
}

test("season backfill, routing, and database constraints", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let userId: string | null = null;
  let failed: unknown = null;
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
    const user = await createUser(prisma, stamp);
    userId = user.id;
    const chicago = await createVineyard(prisma, user.id, "America/Chicago");
    const auckland = await createVineyard(prisma, user.id, "Pacific/Auckland");
    const invalid = await createVineyard(prisma, user.id, "Not/AZone");
    const preassigned = await createVineyard(prisma, user.id, "UTC");
    const empty = await createVineyard(prisma, user.id, "America/Chicago");
    const removed = await createVineyard(prisma, user.id, "America/Chicago", new Date());

    const liveRow = await createRow(prisma, chicago.id, "NS1");
    const deletedRow = await createRow(prisma, chicago.id, "NS2", new Date());
    const aucklandRow = await createRow(prisma, auckland.id, "NS1");

    const dec31Utc = new Date("2025-01-01T05:30:00.000Z");
    const jan1Local = new Date("2025-01-01T06:00:00.000Z");
    const mid2020 = new Date("2020-06-15T17:00:00.000Z");
    const harvestDec31 = await prisma.harvest.create({
      data: {
        vineyardId: chicago.id,
        rowId: liveRow.id,
        harvestedAt: dec31Utc,
        yieldAmount: "4.00",
        yieldUnit: "lb",
      },
    });
    const harvestJan1 = await prisma.harvest.create({
      data: {
        vineyardId: chicago.id,
        rowId: liveRow.id,
        harvestedAt: jan1Local,
        yieldAmount: "7.00",
        yieldUnit: "lb",
      },
    });
    await prisma.harvest.create({
      data: {
        vineyardId: chicago.id,
        rowId: liveRow.id,
        harvestedAt: mid2020,
        yieldAmount: "10.00",
        yieldUnit: "lb",
      },
    });
    await prisma.harvest.create({
      data: {
        vineyardId: chicago.id,
        rowId: liveRow.id,
        harvestedAt: mid2020,
        yieldAmount: "2.00",
        yieldUnit: "kg",
      },
    });
    await prisma.harvest.create({
      data: {
        vineyardId: chicago.id,
        rowId: liveRow.id,
        harvestedAt: mid2020,
        yieldAmount: "5.00",
        yieldUnit: "bin",
      },
    });
    const deletedRowHarvest = await prisma.harvest.create({
      data: {
        vineyardId: chicago.id,
        rowId: deletedRow.id,
        harvestedAt: mid2020,
        yieldAmount: "9.00",
        yieldUnit: "lb",
      },
    });
    const deletedHarvest = await prisma.harvest.create({
      data: {
        vineyardId: chicago.id,
        rowId: liveRow.id,
        harvestedAt: mid2020,
        yieldAmount: "8.00",
        yieldUnit: "lb",
        deletedAt: new Date(),
      },
    });
    const aucklandPrevious = await prisma.harvest.create({
      data: {
        vineyardId: auckland.id,
        rowId: aucklandRow.id,
        harvestedAt: new Date("2020-12-31T10:30:00.000Z"),
        yieldAmount: "1.00",
        yieldUnit: "lb",
      },
    });
    const aucklandNewYear = await prisma.harvest.create({
      data: {
        vineyardId: auckland.id,
        rowId: aucklandRow.id,
        harvestedAt: new Date("2020-12-31T11:30:00.000Z"),
        yieldAmount: "6.00",
        yieldUnit: "lb",
      },
    });

    const currentYear = localYear(new Date(), "America/Chicago");
    const task2020 = await prisma.task.create({
      data: taskData(chicago.id, mid2020, { rowId: liveRow.id }),
    });
    await prisma.task.create({ data: taskData(chicago.id, dec31Utc) });
    await prisma.task.create({ data: taskData(chicago.id, jan1Local) });
    const deletedTask = await prisma.task.create({
      data: taskData(chicago.id, mid2020, { deletedAt: new Date() }),
    });
    const taskOnDeletedRow = await prisma.task.create({
      data: taskData(chicago.id, mid2020, { rowId: deletedRow.id }),
    });
    const futureTask = await prisma.task.create({
      data: taskData(chicago.id, new Date(`${currentYear + 2}-06-01T17:00:00.000Z`)),
    });
    const activity2020 = await prisma.activity.create({
      data: {
        vineyardId: chicago.id,
        rowId: liveRow.id,
        scopeType: "row",
        scopeId: liveRow.id,
        activityType: "pruning",
        performedAt: mid2020,
        details: { fixture: true },
        source: "manual",
      },
    });
    await prisma.activity.create({
      data: {
        vineyardId: chicago.id,
        scopeType: "vineyard",
        scopeId: chicago.id,
        activityType: "watering",
        performedAt: new Date("2024-11-03T06:30:00.000Z"),
        details: { dst: "before" },
        source: "manual",
      },
    });
    await prisma.activity.create({
      data: {
        vineyardId: chicago.id,
        scopeType: "vineyard",
        scopeId: chicago.id,
        activityType: "watering",
        performedAt: new Date("2024-11-03T07:30:00.000Z"),
        details: { dst: "after" },
        source: "manual",
      },
    });
    await prisma.activity.create({
      data: {
        vineyardId: chicago.id,
        scopeType: "vineyard",
        scopeId: chicago.id,
        activityType: "pruning",
        performedAt: new Date("2024-03-10T08:30:00.000Z"),
        details: {},
        source: "manual",
        deletedAt: new Date(),
      },
    });

    const invalidTask = await prisma.task.create({
      data: taskData(invalid.id, mid2020),
    });
    const keptSeason = await prisma.season.create({
      data: { vineyardId: preassigned.id, year: 2019, status: "legacy" },
    });
    const keptTask = await prisma.task.create({
      data: taskData(preassigned.id, new Date("2021-06-01T12:00:00.000Z"), {
        seasonId: keptSeason.id,
        title: "preassigned",
      }),
    });
    const openTask = await prisma.task.create({
      data: taskData(preassigned.id, new Date("2021-06-01T12:00:00.000Z"), {
        title: "open",
      }),
    });
    const removedTask = await prisma.task.create({
      data: taskData(removed.id, mid2020),
    });

    const beforeTasks = await prisma.task.findMany({ where: { vineyardId: chicago.id } });
    const beforeHarvests = await prisma.harvest.findMany({ where: { vineyardId: chicago.id } });
    const beforeActivities = await prisma.activity.findMany({
      where: { vineyardId: chicago.id },
    });
    const seasonCountBefore = await prisma.season.count();
    const untaggedBefore = await prisma.task.count({ where: { seasonId: null } });

    const dryRun = await runBackfill({ databaseUrl, mode: "dry-run" });
    assert.equal(await prisma.season.count(), seasonCountBefore);
    assert.equal(await prisma.task.count({ where: { seasonId: null } }), untaggedBefore);
    const afterDryTasks = await prisma.task.findMany({ where: { vineyardId: chicago.id } });
    assert.deepEqual(
      afterDryTasks.map((task) => [task.id, task.seasonId, task.updatedAt.toISOString(), task.title, task.status]),
      beforeTasks.map((task) => [task.id, task.seasonId, task.updatedAt.toISOString(), task.title, task.status]),
    );

    const applied = await runBackfill({ databaseUrl, mode: "apply" });
    assert.deepEqual(applied, dryRun);
    const rendered = applied.map(formatBackfillLine).join("\n");
    assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(rendered), false);
    assert.equal(rendered.includes(databaseUrl), false);

    const chicagoSeasons = await prisma.season.findMany({ where: { vineyardId: chicago.id } });
    const seasonYear = new Map(chicagoSeasons.map((item) => [item.id, item.year]));
    const tasks = await prisma.task.findMany({ where: { vineyardId: chicago.id } });
    const liveTasks = tasks.filter((task) => task.deletedAt == null);
    for (const [year, count] of countYears(liveTasks.map((task) => task.dueAt), "America/Chicago")) {
      if (year > currentYear) {
        assert.equal(liveTasks.filter((task) => localYear(task.dueAt, "America/Chicago") === year && task.seasonId).length, 0);
      } else {
        assert.equal(
          liveTasks.filter((task) => task.seasonId != null && seasonYear.get(task.seasonId) === year).length,
          count,
        );
      }
    }
    assert.equal(tasks.find((task) => task.id === futureTask.id)?.seasonId, null);
    assert.notEqual(tasks.find((task) => task.id === deletedTask.id)?.seasonId, null);
    assert.equal(seasonYear.get(tasks.find((task) => task.id === taskOnDeletedRow.id)?.seasonId ?? ""), 2020);
    assert.equal(seasonYear.get(tasks.find((task) => task.id === task2020.id)?.seasonId ?? ""), 2020);

    const harvests = await prisma.harvest.findMany({ where: { vineyardId: chicago.id } });
    const rows = await prisma.row.findMany({ where: { vineyardId: chicago.id } });
    const activities = await prisma.activity.findMany({ where: { vineyardId: chicago.id } });
    assert.equal(
      seasonYear.get(harvests.find((harvest) => harvest.id === harvestDec31.id)?.seasonId ?? ""),
      2024,
    );
    assert.equal(
      seasonYear.get(harvests.find((harvest) => harvest.id === harvestJan1.id)?.seasonId ?? ""),
      2025,
    );
    assert.notEqual(harvests.find((harvest) => harvest.id === deletedRowHarvest.id)?.seasonId, null);
    assert.notEqual(harvests.find((harvest) => harvest.id === deletedHarvest.id)?.seasonId, null);
    assert.equal(activities.find((activity) => activity.id === activity2020.id)?.details && true, true);
    assert.deepEqual(activities.find((activity) => activity.id === activity2020.id)?.details, { fixture: true });
    for (const before of beforeHarvests) {
      const after = harvests.find((harvest) => harvest.id === before.id);
      assert.equal(after?.yieldAmount.toString(), before.yieldAmount.toString());
      assert.equal(after?.yieldUnit, before.yieldUnit);
      assert.equal(after?.updatedAt.toISOString(), before.updatedAt.toISOString());
    }
    for (const before of beforeActivities) {
      const after = activities.find((activity) => activity.id === before.id);
      assert.equal(after?.updatedAt.toISOString(), before.updatedAt.toISOString());
      assert.deepEqual(after?.details, before.details);
    }
    for (const before of beforeTasks) {
      const after = tasks.find((task) => task.id === before.id);
      assert.equal(after?.title, before.title);
      assert.equal(after?.status, before.status);
      assert.equal(after?.updatedAt.toISOString(), before.updatedAt.toISOString());
    }

    const liveRows = rows.filter((row) => row.deletedAt == null);
    const liveHarvests = harvests.filter((harvest) => harvest.deletedAt == null);
    const metrics = buildVineyardMetrics({
      vineyardId: chicago.id,
      timeZone: "America/Chicago",
      catalog: [],
      healthThresholds: THRESHOLDS,
      asOf: new Date(),
      period: "year",
      rows: liveRows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        variety: row.variety,
        status: row.status,
      })),
      tasks: liveTasks.map((task) => ({
        id: task.id,
        rowId: task.rowId,
        title: task.title,
        dueAt: task.dueAt.toISOString(),
        status: task.status,
      })),
      activities: activities
        .filter((activity) => activity.deletedAt == null)
        .map((activity) => ({
          id: activity.id,
          rowId: activity.rowId,
          scopeType: activity.scopeType as "row" | "vineyard",
          activityType: activity.activityType,
          performedAt: activity.performedAt.toISOString(),
          details:
            activity.details && typeof activity.details === "object" && !Array.isArray(activity.details)
              ? (activity.details as Record<string, unknown>)
              : null,
        })),
      harvests: liveHarvests.map((harvest) => ({
        rowId: harvest.rowId,
        harvestedAt: harvest.harvestedAt.toISOString(),
        yieldAmount: Number(harvest.yieldAmount),
        yieldUnit: harvest.yieldUnit,
      })),
    });
    const lbByYear = new Map<number, number>();
    for (const harvest of liveHarvests) {
      if (!liveRows.some((row) => row.id === harvest.rowId)) continue;
      const pounds = yieldToLb(Number(harvest.yieldAmount), harvest.yieldUnit as YieldUnit);
      if (pounds == null) continue;
      const year = seasonYear.get(harvest.seasonId ?? "");
      assert.equal(year, localYear(harvest.harvestedAt, "America/Chicago"));
      lbByYear.set(year ?? 0, (lbByYear.get(year ?? 0) ?? 0) + pounds);
    }
    for (const year of metrics.harvests.years) {
      assert.equal(roundLb(lbByYear.get(year.year) ?? 0), year.total);
    }
    assert.equal(metrics.harvests.skippedNonLb, 1);

    const liveActivities = activities.filter((activity) => activity.deletedAt == null);
    for (const [year, count] of countYears(
      liveActivities.map((activity) => activity.performedAt),
      "America/Chicago",
    )) {
      assert.equal(
        liveActivities.filter(
          (activity) => activity.seasonId != null && seasonYear.get(activity.seasonId) === year,
        ).length,
        count,
      );
    }

    const aucklandSeasons = await prisma.season.findMany({ where: { vineyardId: auckland.id } });
    const aucklandYearById = new Map(aucklandSeasons.map((item) => [item.id, item.year]));
    const previous = await prisma.harvest.findUnique({ where: { id: aucklandPrevious.id } });
    const next = await prisma.harvest.findUnique({ where: { id: aucklandNewYear.id } });
    assert.equal(aucklandYearById.get(previous?.seasonId ?? ""), 2020);
    assert.equal(aucklandYearById.get(next?.seasonId ?? ""), 2021);

    const invalidAfter = await prisma.task.findUnique({ where: { id: invalidTask.id } });
    assert.equal(invalidAfter?.seasonId, null);
    assert.equal(await prisma.season.count({ where: { vineyardId: invalid.id } }), 0);
    const removedAfter = await prisma.task.findUnique({ where: { id: removedTask.id } });
    assert.equal(removedAfter?.seasonId, null);
    assert.equal(await prisma.season.count({ where: { vineyardId: removed.id } }), 0);

    const keptAfter = await prisma.task.findUnique({ where: { id: keptTask.id } });
    const openAfter = await prisma.task.findUnique({ where: { id: openTask.id } });
    assert.equal(keptAfter?.seasonId, keptSeason.id);
    assert.equal(keptAfter?.title, "preassigned");
    const openSeason = await prisma.season.findUnique({ where: { id: openAfter?.seasonId ?? "" } });
    assert.equal(openSeason?.year, 2021);
    assert.equal(openSeason?.status, "legacy");
    const keptStill = await prisma.season.findUnique({ where: { id: keptSeason.id } });
    assert.equal(keptStill?.status, "legacy");
    assert.equal(keptStill?.year, 2019);

    const emptySeasons = await prisma.season.findMany({ where: { vineyardId: empty.id } });
    assert.equal(emptySeasons.length, 1);
    assert.equal(emptySeasons[0]?.status, "active");
    assert.equal(emptySeasons[0]?.year, localYear(new Date(), "America/Chicago"));

    const beforeRerun = await prisma.task.findMany({
      where: { vineyardId: chicago.id },
      select: { id: true, seasonId: true },
      orderBy: { id: "asc" },
    });
    const seasonCountAtRerun = await prisma.season.count();
    const rerun = await runBackfill({ databaseUrl, mode: "apply" });
    assert.equal(rerun.some((line) => line.reason === "tag" || line.reason === "create_legacy" || line.reason === "create_active"), false);
    assert.equal(await prisma.season.count(), seasonCountAtRerun);
    assert.deepEqual(
      await prisma.task.findMany({
        where: { vineyardId: chicago.id },
        select: { id: true, seasonId: true },
        orderBy: { id: "asc" },
      }),
      beforeRerun,
    );

    const kill = await createVineyard(prisma, user.id, "UTC");
    const killTasks = [];
    for (const title of ["k1", "k2", "k3"]) {
      killTasks.push(
        await prisma.task.create({
          data: taskData(kill.id, new Date("2020-06-01T00:00:00.000Z"), { title }),
        }),
      );
    }
    await runBackfill({ databaseUrl, mode: "apply", batchSize: 1, maxTagBatches: 1 });
    const partial = await prisma.task.findMany({ where: { vineyardId: kill.id } });
    assert.equal(partial.filter((task) => task.seasonId != null).length, 1);
    await runBackfill({ databaseUrl, mode: "apply" });
    const finished = await prisma.task.findMany({ where: { vineyardId: kill.id } });
    assert.equal(new Set(finished.map((task) => task.seasonId)).size, 1);
    assert.ok(finished.every((task) => task.seasonId != null));
    const killSeasons = await prisma.season.findMany({ where: { vineyardId: kill.id } });
    assert.equal(killSeasons.filter((item) => item.year === 2020).length, 1);
    const resume = await runBackfill({ databaseUrl, mode: "apply" });
    assert.equal(
      resume.some((line) => line.reason === "tag" || line.reason === "create_legacy" || line.reason === "create_active"),
      false,
    );
    const resumed = await prisma.task.findMany({ where: { vineyardId: kill.id } });
    assert.deepEqual(
      resumed.map((task) => task.seasonId).sort(),
      finished.map((task) => task.seasonId).sort(),
    );

    const activeVineyard = await createVineyard(prisma, user.id, "America/Chicago");
    const activeSeason = await prisma.season.create({
      data: { vineyardId: activeVineyard.id, year: 1999, status: "active" },
    });
    const activeTask = await runSeasonTransaction(prisma, activeVineyard.id, (tx, seasonId) =>
      tx.task.create({
        data: taskData(activeVineyard.id, new Date("2020-01-01T00:00:00.000Z"), { seasonId }),
      }),
    );
    assert.equal(activeTask.seasonId, activeSeason.id);
    assert.equal(await prisma.season.count({ where: { vineyardId: activeVineyard.id } }), 1);

    const plannedVineyard = await createVineyard(prisma, user.id, "America/Chicago");
    const plannedSeason = await prisma.season.create({
      data: { vineyardId: plannedVineyard.id, year: 2031, status: "planned" },
    });
    const plannedTask = await runSeasonTransaction(prisma, plannedVineyard.id, (tx, seasonId) =>
      tx.task.create({
        data: taskData(plannedVineyard.id, new Date("2010-01-01T00:00:00.000Z"), { seasonId }),
      }),
    );
    assert.equal(plannedTask.seasonId, plannedSeason.id);

    const fresh = await createVineyard(prisma, user.id, "America/Chicago");
    const freshTask = await runSeasonTransaction(prisma, fresh.id, (tx, seasonId) =>
      tx.task.create({
        data: taskData(fresh.id, new Date("2001-01-01T00:00:00.000Z"), { seasonId }),
      }),
    );
    const freshSeason = await prisma.season.findUnique({ where: { id: freshTask.seasonId ?? "" } });
    assert.equal(freshSeason?.status, "active");
    assert.equal(freshSeason?.year, localYear(new Date(), "America/Chicago"));

    const closedVineyard = await createVineyard(prisma, user.id, "America/Chicago");
    const closedYear = localYear(new Date(), "America/Chicago");
    await prisma.season.create({
      data: { vineyardId: closedVineyard.id, year: closedYear, status: "closed" },
    });
    const closedTask = await runSeasonTransaction(prisma, closedVineyard.id, (tx, seasonId) =>
      tx.task.create({
        data: taskData(closedVineyard.id, new Date(`${closedYear}-06-01T17:00:00.000Z`), {
          seasonId,
        }),
      }),
    );
    const plannedNext = await prisma.season.findUnique({ where: { id: closedTask.seasonId ?? "" } });
    assert.equal(plannedNext?.status, "planned");
    assert.equal(plannedNext?.year, closedYear + 1);

    const legacyVineyard = await createVineyard(prisma, user.id, "UTC");
    await prisma.season.create({
      data: { vineyardId: legacyVineyard.id, year: 2018, status: "legacy" },
    });
    await assert.rejects(
      () =>
        runSeasonTransaction(prisma, legacyVineyard.id, (tx, seasonId) =>
          tx.task.create({
            data: taskData(legacyVineyard.id, new Date("2018-06-01T00:00:00.000Z"), { seasonId }),
          }),
        ),
      (error: unknown) => error instanceof HttpError && error.code === "SEASON_SETUP_REQUIRED",
    );
    assert.equal(await prisma.season.count({ where: { vineyardId: legacyVineyard.id } }), 1);

    const concurrent = await createVineyard(prisma, user.id, "UTC");
    const concurrentRow = await createRow(prisma, concurrent.id, "C1");
    const [first, second] = await Promise.all([
      runSeasonTransaction(prisma, concurrent.id, (tx, seasonId) =>
        tx.task.create({
          data: taskData(concurrent.id, new Date("2002-01-01T00:00:00.000Z"), {
            seasonId,
            title: "first",
          }),
        }),
      ),
      runSeasonTransaction(prisma, concurrent.id, (tx, seasonId) =>
        tx.harvest.create({
          data: {
            vineyardId: concurrent.id,
            rowId: concurrentRow.id,
            seasonId,
            harvestedAt: new Date("2003-01-01T00:00:00.000Z"),
            yieldAmount: "1.00",
            yieldUnit: "lb",
          },
        }),
      ),
    ]);
    assert.equal(first.seasonId, second.seasonId);
    assert.equal(await prisma.season.count({ where: { vineyardId: concurrent.id } }), 1);

    const linkA = await createVineyard(prisma, user.id, "UTC");
    const linkB = await createVineyard(prisma, user.id, "UTC");
    const linkRow = await createRow(prisma, linkB.id, "B1");
    const linkSeason = await prisma.season.create({
      data: { vineyardId: linkA.id, year: 2002, status: "legacy" },
    });
    await assert.rejects(() =>
      prisma.task.create({
        data: taskData(linkB.id, mid2020, { seasonId: linkSeason.id }),
      }),
    );
    await assert.rejects(() =>
      prisma.harvest.create({
        data: {
          vineyardId: linkB.id,
          rowId: linkRow.id,
          seasonId: linkSeason.id,
          harvestedAt: mid2020,
          yieldAmount: "1.00",
          yieldUnit: "lb",
        },
      }),
    );
    await assert.rejects(() =>
      prisma.activity.create({
        data: {
          vineyardId: linkB.id,
          seasonId: linkSeason.id,
          scopeType: "vineyard",
          scopeId: linkB.id,
          activityType: "pruning",
          performedAt: mid2020,
          details: {},
          source: "manual",
        },
      }),
    );

    const duplicate = await createVineyard(prisma, user.id, "UTC");
    await prisma.season.create({ data: { vineyardId: duplicate.id, year: 2003, status: "legacy" } });
    await assert.rejects(() =>
      prisma.season.create({ data: { vineyardId: duplicate.id, year: 2003, status: "closed" } }),
    );
    const oneActive = await createVineyard(prisma, user.id, "UTC");
    await prisma.season.create({ data: { vineyardId: oneActive.id, year: 2004, status: "active" } });
    await assert.rejects(() =>
      prisma.season.create({ data: { vineyardId: oneActive.id, year: 2005, status: "active" } }),
    );
    const onePlanned = await createVineyard(prisma, user.id, "UTC");
    await prisma.season.create({
      data: { vineyardId: onePlanned.id, year: 2006, status: "planned" },
    });
    await assert.rejects(() =>
      prisma.season.create({ data: { vineyardId: onePlanned.id, year: 2007, status: "planned" } }),
    );

    const seasonsBeforeSpawn = await prisma.season.count();
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/backfill-seasons.ts", "--database-url-env", "SEASONS_TEST_DATABASE_URL"],
      {
        cwd: apiRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const [code] = (await once(child, "exit")) as [number | null];
    const safeStdout = stdout.replaceAll(databaseUrl, "[redacted]");
    const safeStderr = stderr.replaceAll(databaseUrl, "[redacted]");
    assert.equal(code, 0, safeStderr.slice(0, 500));
    assert.equal(stdout.includes(databaseUrl), false);
    assert.equal(stderr.includes(databaseUrl), false);
    assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(safeStdout), false);
    assert.equal(await prisma.season.count(), seasonsBeforeSpawn);

    await raceConcurrentTagPreservation(prisma, user.id);
    await raceFullBackfillSkippedConcurrent(prisma, user.id);
    await caseA1CliSkippedRerun(prisma, user.id);
    await caseA2MaxTagBatches(prisma, user.id);
    await caseA3InsertBeforeAndDuring(prisma, user.id);
    await caseA4HeldCandidates(prisma, user.id);
    await caseA5OverlappingApplies(prisma, user.id);
    await caseA6InvalidOptions(prisma, user.id);
  } catch (error) {
    failed = error;
    throw error;
  } finally {
    if (failed !== null && testApplicationNames.size > 0) {
      let leftoverPids: number[] | null = null;
      let checkError: unknown = null;
      try {
        leftoverPids = await raceDeadline(
          namedBackendPids(prisma, [...testApplicationNames]),
          CANCEL_IO_MS,
          "named backend check timed out",
        );
      } catch (error) {
        checkError = error;
      }
      if (checkError !== null || (leftoverPids !== null && leftoverPids.length > 0)) {
        let disconnectNote = "";
        try {
          await raceDeadline(prisma.$disconnect(), CANCEL_IO_MS, "disconnect timed out");
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          disconnectNote = `; disconnect failed: ${detail}`;
        }
        const reason =
          checkError !== null
            ? `could not verify named backends were gone; skipping owner cleanup${disconnectNote}`
            : `named backends still active (pids ${(leftoverPids ?? []).join(", ")}); skipping owner cleanup${disconnectNote}`;
        const cause = failed instanceof Error ? failed : new Error(String(failed));
        if (checkError !== null) {
          const detail = checkError instanceof Error ? checkError.message : String(checkError);
          throw new Error(`${reason}; check failed: ${detail}`, { cause });
        }
        throw new Error(reason, { cause });
      }
    }
    if (userId) await cleanup(prisma, userId);
    await prisma.$disconnect();
  }
});

/** Direct tagBatch races use their own 20s transactions, so this lock wait stays 8s. */
const RACE_LOCK_WAIT_MS = 8000;

/** runBackfill and CLI barriers end before Prisma's 5s interactive-transaction default. */
const WORKER_BARRIER_MS = 4000;

/** Holder acquisition through worker completion and cleanup. Below the 30s holder timeout. */
const RUN_BEHIND_HOLD_BUDGET_MS = 25_000;

/** After the holder ends, wait this long for workers before cancelling named backends. */
const WORKER_SETTLE_MS = 2_000;

/** Bound for one CLI close, one disconnect, or one named-backend query. */
const CANCEL_IO_MS = 2_000;

let activeCliCancel: ((deadline: number) => Promise<void>) | null = null;

function pidList(value: unknown): number[] {
  if (Array.isArray(value)) return value.map((item) => Number(item));
  if (typeof value === "string") {
    return value
      .replace(/[{}]/g, "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => Number(item));
  }
  return [];
}

async function backendPid(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
  const pid = Number(rows[0]?.pid);
  assert.equal(Number.isInteger(pid) && pid > 0, true);
  return pid;
}

/** Poll until pg_blocking_pids(backfillPid) contains the holder. A row lock wait shows up here. */
async function waitForBackfillBlockedBy(
  looker: PrismaClient,
  backfillPid: number,
  holderPid: number,
  timeoutMs = RACE_LOCK_WAIT_MS,
): Promise<number[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await looker.$queryRaw<Array<{ blockers: unknown }>>`
      SELECT pg_blocking_pids(CAST(${backfillPid} AS int)) AS blockers
    `;
    const blockers = pidList(rows[0]?.blockers);
    if (blockers.includes(holderPid)) return blockers;
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out waiting for backfill pid ${backfillPid} to be blocked by pid ${holderPid}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function waitForBackendBlockedBy(
  looker: PrismaClient,
  holderPid: number,
  timeoutMs: number,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await looker.$queryRaw<Array<{ pid: number }>>`
      SELECT a.pid::int AS pid
      FROM pg_stat_activity a
      WHERE a.pid <> pg_backend_pid()
        AND CAST(${holderPid} AS int) = ANY (pg_blocking_pids(a.pid))
      LIMIT 1
    `;
    const pid = Number(rows[0]?.pid ?? 0);
    if (pid > 0) return pid;
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for a backfill pid blocked by pid ${holderPid}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function delay(ms: number, isCancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (isCancelled()) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      clearInterval(poll);
      resolve();
    }, ms);
    const poll = setInterval(() => {
      if (!isCancelled()) return;
      clearTimeout(timer);
      clearInterval(poll);
      resolve();
    }, 20);
  });
}

/**
 * Cycle-safe blocking graph: UNION drops pids already seen, so a lock cycle cannot loop.
 * Passes only when both worker application names are in that graph.
 */
async function waitForNamedWorkersBlocked(
  looker: PrismaClient,
  holderPid: number,
  firstName: string,
  secondName: string,
  timeoutMs: number,
  isCancelled: () => boolean,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (isCancelled()) return;
    const rows = await looker.$queryRaw<Array<{ name: string | null }>>`
      WITH RECURSIVE blocked AS (
        SELECT a.pid
        FROM pg_stat_activity a
        WHERE a.datname = current_database()
          AND a.pid <> pg_backend_pid()
          AND a.pid <> CAST(${holderPid} AS int)
          AND CAST(${holderPid} AS int) = ANY (pg_blocking_pids(a.pid))
        UNION
        SELECT a.pid
        FROM pg_stat_activity a
        INNER JOIN blocked b ON b.pid = ANY (pg_blocking_pids(a.pid))
        WHERE a.datname = current_database()
          AND a.pid <> pg_backend_pid()
          AND a.pid <> CAST(${holderPid} AS int)
      )
      SELECT DISTINCT a.application_name AS name
      FROM pg_stat_activity a
      INNER JOIN blocked b ON b.pid = a.pid
      WHERE a.datname = current_database()
        AND a.application_name IN (${firstName}, ${secondName})
    `;
    const seen = new Set(rows.map((row) => row.name));
    if (seen.has(firstName) && seen.has(secondName)) return;
    if (Date.now() >= deadline) {
      throw new Error("timed out waiting for both worker application names in the blocking graph");
    }
    await delay(20, isCancelled);
  }
}

async function namedBackendPids(client: PrismaClient, names: readonly string[]): Promise<number[]> {
  if (names.length === 0) return [];
  const allowed = new Set(names);
  const rows = await client.$queryRaw<Array<{ pid: number; application_name: string | null }>>`
    SELECT pid::int AS pid, application_name
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
  `;
  const pids: number[] = [];
  for (const row of rows) {
    if (row.application_name == null || !allowed.has(row.application_name)) continue;
    const pid = Number(row.pid);
    if (Number.isInteger(pid) && pid > 0) pids.push(pid);
  }
  return pids;
}

async function cancelNamedBackends(
  client: PrismaClient,
  names: readonly string[],
  deadline: number,
): Promise<void> {
  if (names.length === 0) return;
  const pids = await raceDeadline(
    namedBackendPids(client, names),
    deadline - Date.now(),
    "named backend lookup exceeded the runBehindHold budget",
  );
  for (const pid of pids) {
    await raceDeadline(
      client.$queryRaw`SELECT pg_cancel_backend(CAST(${pid} AS int))`,
      deadline - Date.now(),
      "pg_cancel_backend exceeded the runBehindHold budget",
    );
  }
}

async function insertRaceRow(
  prisma: PrismaClient,
  table: "tasks" | "harvests" | "activities",
  vineyardId: string,
  rowId: string,
  at: Date,
): Promise<string> {
  if (table === "tasks") {
    const created = await prisma.task.create({
      data: taskData(vineyardId, at, { rowId }),
    });
    return created.id;
  }
  if (table === "harvests") {
    const created = await prisma.harvest.create({
      data: {
        vineyardId,
        rowId,
        harvestedAt: at,
        yieldAmount: "1.00",
        yieldUnit: "lb",
      },
    });
    return created.id;
  }
  const created = await prisma.activity.create({
    data: {
      vineyardId,
      rowId,
      scopeType: "row",
      scopeId: rowId,
      activityType: "pruning",
      performedAt: at,
      details: {},
      source: "manual",
    },
  });
  return created.id;
}

async function lockRow(
  tx: Prisma.TransactionClient,
  table: "tasks" | "harvests" | "activities",
  rowId: string,
): Promise<void> {
  const rows =
    table === "tasks"
      ? await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "tasks" WHERE "id" = CAST(${rowId} AS uuid) FOR UPDATE
        `
      : table === "harvests"
        ? await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "harvests" WHERE "id" = CAST(${rowId} AS uuid) FOR UPDATE
          `
        : await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "activities" WHERE "id" = CAST(${rowId} AS uuid) FOR UPDATE
          `;
  assert.equal(rows.length, 1);
}

async function assignSeason(
  tx: Prisma.TransactionClient,
  table: "tasks" | "harvests" | "activities",
  rowId: string,
  seasonId: string,
): Promise<void> {
  if (table === "tasks") {
    await tx.$executeRaw`
      UPDATE "tasks"
      SET "season_id" = CAST(${seasonId} AS uuid)
      WHERE "id" = CAST(${rowId} AS uuid)
        AND "season_id" IS NULL
    `;
    return;
  }
  if (table === "harvests") {
    await tx.$executeRaw`
      UPDATE "harvests"
      SET "season_id" = CAST(${seasonId} AS uuid)
      WHERE "id" = CAST(${rowId} AS uuid)
        AND "season_id" IS NULL
    `;
    return;
  }
  await tx.$executeRaw`
    UPDATE "activities"
    SET "season_id" = CAST(${seasonId} AS uuid)
    WHERE "id" = CAST(${rowId} AS uuid)
      AND "season_id" IS NULL
  `;
}

async function moveTimestamp(
  tx: Prisma.TransactionClient,
  table: "tasks" | "harvests" | "activities",
  rowId: string,
  at: Date,
): Promise<void> {
  if (table === "tasks") {
    await tx.$executeRaw`
      UPDATE "tasks"
      SET "due_at" = ${at}
      WHERE "id" = CAST(${rowId} AS uuid)
        AND "season_id" IS NULL
    `;
    return;
  }
  if (table === "harvests") {
    await tx.$executeRaw`
      UPDATE "harvests"
      SET "harvested_at" = ${at}
      WHERE "id" = CAST(${rowId} AS uuid)
        AND "season_id" IS NULL
    `;
    return;
  }
  await tx.$executeRaw`
    UPDATE "activities"
    SET "performed_at" = ${at}
    WHERE "id" = CAST(${rowId} AS uuid)
      AND "season_id" IS NULL
  `;
}

/**
 * Connection A locks the row. Connection B records its backend pid, then its tag UPDATE blocks.
 * The barrier is pg_blocking_pids(B) containing A's pid. A then commits. B must not overwrite A.
 */
async function raceOneRow(
  prisma: PrismaClient,
  table: "tasks" | "harvests" | "activities",
  rowId: string,
  vineyardId: string,
  tag: TagPlan,
  backfillSeasonId: string,
  mutate: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<number> {
  const holder = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const looker = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let releaseHold = (): void => {};
  let holdPromise: Promise<unknown> = Promise.resolve();
  let tagPromise: Promise<number> | null = null;
  try {
    let markLocked = (): void => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    let holderPid = 0;
    holdPromise = holder.$transaction(
      async (tx) => {
        holderPid = await backendPid(tx);
        await lockRow(tx, table, rowId);
        markLocked();
        await released;
        await mutate(tx);
      },
      { timeout: 20000, maxWait: 5000 },
    );
    await locked;
    let backfillPid = 0;
    let markBackfillPid = (): void => {};
    const backfillPidReady = new Promise<void>((resolve) => {
      markBackfillPid = resolve;
    });
    tagPromise = prisma.$transaction(
      async (tx) => {
        backfillPid = await backendPid(tx);
        markBackfillPid();
        return tagBatch(tx, tag, backfillSeasonId, vineyardId, 1);
      },
      { timeout: 20000 },
    );
    await backfillPidReady;
    const blockers = await waitForBackfillBlockedBy(looker, backfillPid, holderPid);
    assert.equal(blockers.includes(holderPid), true);
    releaseHold();
    const updated = await tagPromise;
    await holdPromise;
    return updated;
  } finally {
    releaseHold();
    await tagPromise?.catch(() => undefined);
    await holdPromise.catch(() => undefined);
    await holder.$disconnect();
    await looker.$disconnect();
  }
}

async function raceConcurrentTagPreservation(prisma: PrismaClient, ownerId: string): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const vine = await createRow(prisma, vineyard.id, "RC1");
  const other = await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2019, status: "legacy" },
  });
  const backfillSeason = await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2020, status: "legacy" },
  });
  const at = new Date("2020-06-01T00:00:00.000Z");
  const outside = new Date("2021-06-01T00:00:00.000Z");
  const tagFor = (table: "tasks" | "harvests" | "activities"): TagPlan => ({
    table,
    year: 2020,
    start: new Date("2020-01-01T00:00:00.000Z"),
    end: new Date("2021-01-01T00:00:00.000Z"),
    count: 1,
  });
  const tables = ["tasks", "harvests", "activities"] as const;

  for (const table of tables) {
    const rowId = await insertRaceRow(prisma, table, vineyard.id, vine.id, at);
    const updated = await raceOneRow(
      prisma,
      table,
      rowId,
      vineyard.id,
      tagFor(table),
      backfillSeason.id,
      (tx) => assignSeason(tx, table, rowId, other.id),
    );
    assert.equal(updated, 0);
    if (table === "tasks") {
      const kept = await prisma.task.findUniqueOrThrow({ where: { id: rowId } });
      assert.equal(kept.seasonId, other.id);
      assert.equal(kept.dueAt.toISOString(), at.toISOString());
    } else if (table === "harvests") {
      const kept = await prisma.harvest.findUniqueOrThrow({ where: { id: rowId } });
      assert.equal(kept.seasonId, other.id);
      assert.equal(kept.harvestedAt.toISOString(), at.toISOString());
    } else {
      const kept = await prisma.activity.findUniqueOrThrow({ where: { id: rowId } });
      assert.equal(kept.seasonId, other.id);
      assert.equal(kept.performedAt.toISOString(), at.toISOString());
    }
  }

  for (const table of tables) {
    const rowId = await insertRaceRow(prisma, table, vineyard.id, vine.id, at);
    const updated = await raceOneRow(
      prisma,
      table,
      rowId,
      vineyard.id,
      tagFor(table),
      backfillSeason.id,
      (tx) => moveTimestamp(tx, table, rowId, outside),
    );
    assert.equal(updated, 0);
    if (table === "tasks") {
      const kept = await prisma.task.findUniqueOrThrow({ where: { id: rowId } });
      assert.equal(kept.seasonId, null);
      assert.equal(kept.dueAt.toISOString(), outside.toISOString());
    } else if (table === "harvests") {
      const kept = await prisma.harvest.findUniqueOrThrow({ where: { id: rowId } });
      assert.equal(kept.seasonId, null);
      assert.equal(kept.harvestedAt.toISOString(), outside.toISOString());
    } else {
      const kept = await prisma.activity.findUniqueOrThrow({ where: { id: rowId } });
      assert.equal(kept.seasonId, null);
      assert.equal(kept.performedAt.toISOString(), outside.toISOString());
    }
  }
}

/**
 * Full apply, not tagBatch alone. One held task is assigned by A after the backfill UPDATE blocks.
 * The result line is skipped_concurrent count=1, and the task keeps A's season.
 */
async function raceFullBackfillSkippedConcurrent(
  prisma: PrismaClient,
  ownerId: string,
): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const vine = await createRow(prisma, vineyard.id, "RC2");
  const other = await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2019, status: "legacy" },
  });
  await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2020, status: "legacy" },
  });
  const at = new Date("2020-06-01T00:00:00.000Z");
  const task = await prisma.task.create({
    data: taskData(vineyard.id, at, { rowId: vine.id }),
  });
  const live = await prisma.vineyard.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const ordinal = live.findIndex((item) => item.id === vineyard.id) + 1;
  assert.ok(ordinal > 0);

  const holder = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const looker = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let releaseHold = (): void => {};
  let holdPromise: Promise<unknown> = Promise.resolve();
  let backfillPromise: ReturnType<typeof runBackfill> | null = null;
  try {
    let markLocked = (): void => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    let holderPid = 0;
    holdPromise = holder.$transaction(
      async (tx) => {
        holderPid = await backendPid(tx);
        await lockRow(tx, "tasks", task.id);
        markLocked();
        await released;
        await assignSeason(tx, "tasks", task.id, other.id);
      },
      { timeout: 60000, maxWait: 5000 },
    );
    await locked;
    backfillPromise = runBackfill({ databaseUrl, mode: "apply", batchSize: 1 });
    const backfillPid = await waitForBackendBlockedBy(looker, holderPid, 20000);
    const blockers = await waitForBackfillBlockedBy(looker, backfillPid, holderPid);
    assert.equal(blockers.includes(holderPid), true);
    releaseHold();
    const lines = await backfillPromise;
    await holdPromise;
    const skipped = lines.find(
      (line) =>
        line.vineyardOrdinal === ordinal &&
        line.table === "tasks" &&
        line.year === 2020 &&
        line.reason === "skipped_concurrent",
    );
    assert.ok(skipped);
    assert.equal(skipped.count, 1);
    assert.equal(
      formatBackfillLine(skipped),
      `vineyard=${ordinal} year=2020 table=tasks reason=skipped_concurrent count=1`,
    );
    const kept = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    assert.equal(kept.seasonId, other.id);
    assert.equal(kept.dueAt.toISOString(), at.toISOString());
  } finally {
    releaseHold();
    await backfillPromise?.catch(() => undefined);
    await holdPromise.catch(() => undefined);
    await holder.$disconnect();
    await looker.$disconnect();
  }
}

function countYears(dates: Date[], timeZone: string): Map<number, number> {
  const counts = new Map<number, number>();
  for (const date of dates) {
    const year = localYear(date, timeZone);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return counts;
}

const UUID_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function liveOrdinal(prisma: PrismaClient, vineyardId: string): Promise<number> {
  const live = await prisma.vineyard.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const ordinal = live.findIndex((item) => item.id === vineyardId) + 1;
  assert.ok(ordinal > 0);
  return ordinal;
}

async function assertOnlyCaseTags(ordinals: readonly number[]): Promise<void> {
  const lines = await runBackfill({ databaseUrl, mode: "dry-run" });
  const allowed = new Set(ordinals);
  const foreign = lines.filter((line) => line.reason === "tag" && !allowed.has(line.vineyardOrdinal));
  assert.deepEqual(
    foreign.map((line) => formatBackfillLine(line)),
    [],
  );
}

function countReason(
  lines: readonly BackfillLine[],
  ordinal: number,
  reason: BackfillLine["reason"],
): number {
  return lines
    .filter((line) => line.vineyardOrdinal === ordinal && line.reason === reason)
    .reduce((sum, line) => sum + line.count, 0);
}

function hasCreateLine(lines: readonly BackfillLine[], ordinal: number): boolean {
  return lines.some(
    (line) =>
      line.vineyardOrdinal === ordinal &&
      (line.reason === "create_legacy" || line.reason === "create_active"),
  );
}

function createYears(lines: readonly BackfillLine[], ordinal: number): number[] {
  const years: number[] = [];
  for (const line of lines) {
    if (line.vineyardOrdinal !== ordinal) continue;
    if (line.reason !== "create_legacy" && line.reason !== "create_active") continue;
    if (line.year == null) continue;
    years.push(line.year);
  }
  years.sort((left, right) => left - right);
  return years;
}

/** Observer only. Callers still await or race the same promise, so the error still propagates. */
function observeRejection(work: Promise<unknown>): void {
  work.catch(() => undefined);
}

function raceDeadline<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), Math.max(0, ms));
  });
  observeRejection(timeout);
  return Promise.race([work, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function waitForSettle(work: Promise<unknown>, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve("timeout"), Math.max(0, ms));
  });
  return Promise.race([
    work.then(
      () => undefined,
      (error: unknown) => error,
    ),
    timeout,
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function openFailureGate(work: Promise<unknown>): { promise: Promise<void>; close: () => void } {
  let closeGate = () => {};
  let failGate = (_error: unknown) => {};
  const promise = new Promise<void>((resolve, reject) => {
    closeGate = resolve;
    failGate = reject;
  });
  observeRejection(promise);
  work.then(
    () => {},
    (error: unknown) => failGate(error),
  );
  return { promise, close: closeGate };
}

function bothWorkers<T>(left: Promise<T>, right: Promise<T>): Promise<[T, T]> {
  observeRejection(left);
  observeRejection(right);
  return new Promise((resolve, reject) => {
    let settled = false;
    let rejected: Error | null = null;
    const fail = (error: unknown) => {
      const asError = error instanceof Error ? error : new Error(String(error));
      if (rejected) {
        if (!rejected.message.includes(asError.message)) {
          rejected.message = `${rejected.message}; ${asError.message}`;
        }
        return;
      }
      rejected = asError;
      if (!settled) {
        settled = true;
        reject(asError);
      }
    };
    left.then(
      (value) => {
        right.then(
          (other) => {
            if (settled) return;
            settled = true;
            resolve([value, other]);
          },
          (error: unknown) => fail(error),
        );
      },
      (error: unknown) => fail(error),
    );
    right.then(
      () => {},
      (error: unknown) => fail(error),
    );
  });
}

async function waitForWorkerBlocked(
  looker: PrismaClient,
  holderPid: number,
  timeoutMs: number,
  isCancelled: () => boolean,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (isCancelled()) return;
    const rows = await looker.$queryRaw<Array<{ pid: number }>>`
      SELECT a.pid::int AS pid
      FROM pg_stat_activity a
      WHERE a.pid <> pg_backend_pid()
        AND CAST(${holderPid} AS int) = ANY (pg_blocking_pids(a.pid))
      LIMIT 1
    `;
    const pid = Number(rows[0]?.pid ?? 0);
    if (pid > 0) return;
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for a backfill pid blocked by pid ${holderPid}`);
    }
    await delay(20, isCancelled);
  }
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

function textLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.length > 0);
}

function ordinalLines(text: string, ordinal: number): string[] {
  return textLines(text).filter((line) => line.startsWith(`vineyard=${ordinal} `));
}

function assertNoSecrets(stdout: string, stderr: string): void {
  const safeStdout = stdout.replaceAll(databaseUrl, "[redacted]");
  const safeStderr = stderr.replaceAll(databaseUrl, "[redacted]");
  assert.equal(stdout.includes(databaseUrl), false);
  assert.equal(stderr.includes(databaseUrl), false);
  assert.equal(UUID_TEXT.test(safeStdout), false);
  assert.equal(UUID_TEXT.test(safeStderr), false);
}

function spawnApplyCli(): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/backfill-seasons.ts",
      "--apply",
      "--database-url-env",
      "SEASONS_TEST_DATABASE_URL",
    ],
    { cwd: apiRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  const stdoutPipe = child.stdout;
  const stderrPipe = child.stderr;
  if (!stdoutPipe || !stderrPipe) {
    child.kill();
    return Promise.reject(new Error("backfill cli is missing stdio pipes"));
  }
  let stdout = "";
  let stderr = "";
  stdoutPipe.setEncoding("utf8");
  stderrPipe.setEncoding("utf8");
  stdoutPipe.on("data", (chunk: string) => {
    stdout += chunk;
  });
  stderrPipe.on("data", (chunk: string) => {
    stderr += chunk;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let canceling: Promise<void> | null = null;
  const cancelCli = (deadline: number): Promise<void> => {
    if (canceling) return canceling;
    canceling = (async () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      const bound = () => Math.max(0, Math.min(CANCEL_IO_MS, deadline - Date.now()));
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        const closed = await waitForClose(child, bound());
        if (!closed && child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await waitForClose(child, bound());
        }
      }
    })();
    observeRejection(canceling);
    return canceling;
  };
  activeCliCancel = cancelCli;
  const result = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      settle();
    };
    // Standalone CLI backstop. runBehindHold cancels inside its 25s budget and clears this timer.
    timer = setTimeout(() => {
      finish(() => reject(new Error("backfill cli timed out")));
      void cancelCli(Date.now() + CANCEL_IO_MS * 2);
    }, 60_000);
    child.once("error", (error: Error) => {
      finish(() => reject(error));
    });
    child.once("close", (code) => {
      finish(() => resolve({ code, stdout, stderr }));
    });
  });
  observeRejection(result);
  const tracked = result.finally(() => {
    if (activeCliCancel === cancelCli) activeCliCancel = null;
  });
  observeRejection(tracked);
  return tracked;
}

async function runBehindHold<T>(options: {
  rowIds: readonly string[];
  start: () => Promise<T>;
  beforeRelease?: (held: {
    holderPid: number;
    looker: PrismaClient;
    isCancelled: () => boolean;
  }) => Promise<void>;
  mutate?: (tx: Prisma.TransactionClient) => Promise<void>;
  /** A-5 uses one named-worker barrier and skips the one-pid wait. */
  barrier?: "blocked" | "named";
}): Promise<T> {
  const deadline = Date.now() + RUN_BEHIND_HOLD_BUDGET_MS;
  const left = () => deadline - Date.now();
  const holder = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const looker = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let releaseHold = (): void => {};
  let holdPromise: Promise<unknown> = Promise.resolve();
  let started: Promise<T> | null = null;
  let gate: { promise: Promise<void>; close: () => void } | null = null;
  let barrierPromise: Promise<void> = Promise.resolve();
  let mutateNow = false;
  let stopBarrier = false;
  let primary: unknown = null;
  const isCancelled = () => stopBarrier;
  try {
    let markLocked = (): void => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    let holderPid = 0;
    holdPromise = holder.$transaction(
      async (tx) => {
        holderPid = await backendPid(tx);
        for (const rowId of options.rowIds) {
          await lockRow(tx, "tasks", rowId);
        }
        markLocked();
        await released;
        if (mutateNow && options.mutate) await options.mutate(tx);
      },
      { timeout: 30000, maxWait: 5000 },
    );
    observeRejection(holdPromise);
    const holderEnded = holdPromise.then(() => {
      throw new Error("holder ended before lock");
    });
    // After a successful release this rejects by design. The race below still sees an early failure.
    observeRejection(holderEnded);
    await raceDeadline(
      Promise.race([locked, holderEnded]),
      left(),
      "holder acquisition exceeded the runBehindHold budget",
    );
    started = options.start();
    observeRejection(started);
    const tracked = started.then(
      (value) => value,
      (error: unknown) => {
        stopBarrier = true;
        throw error;
      },
    );
    observeRejection(tracked);
    const failureGate = openFailureGate(tracked);
    gate = failureGate;
    barrierPromise = (async () => {
      if (options.barrier !== "named") {
        await waitForWorkerBlocked(
          looker,
          holderPid,
          Math.min(WORKER_BARRIER_MS, Math.max(0, left())),
          isCancelled,
        );
      }
      if (stopBarrier) {
        await failureGate.promise;
        return;
      }
      if (options.beforeRelease) await options.beforeRelease({ holderPid, looker, isCancelled });
      if (stopBarrier) await failureGate.promise;
    })();
    observeRejection(barrierPromise);
    await raceDeadline(
      Promise.race([barrierPromise, failureGate.promise]),
      left(),
      "worker barrier exceeded the runBehindHold budget",
    );
    mutateNow = true;
    releaseHold();
    const result = await raceDeadline(tracked, left(), "worker completion exceeded the runBehindHold budget");
    await raceDeadline(holdPromise, left(), "holder completion exceeded the runBehindHold budget");
    return result;
  } catch (error) {
    stopBarrier = true;
    primary = error;
    throw error;
  } finally {
    stopBarrier = true;
    gate?.close();
    releaseHold();
    const notes: string[] = [];
    const note = (error: unknown) => {
      if (error == null || error === primary) return;
      const message = error instanceof Error ? error.message : String(error);
      if (primary instanceof Error && primary.message.includes(message)) return;
      notes.push(message);
    };
    const barrierResult = await waitForSettle(
      barrierPromise,
      Math.min(CANCEL_IO_MS, Math.max(0, left())),
    );
    if (barrierResult !== "timeout") note(barrierResult);
    if (primary !== null) {
      try {
        const holderResult = await waitForSettle(
          holdPromise,
          Math.min(CANCEL_IO_MS, Math.max(0, left())),
        );
        if (holderResult === "timeout") note(new Error("holder did not settle before cancellation"));
        else note(holderResult);
        if (started) {
          const workerResult = await waitForSettle(
            started,
            Math.min(WORKER_SETTLE_MS, Math.max(0, left())),
          );
          if (workerResult !== "timeout") note(workerResult);
        }
        await cancelNamedBackends(looker, [...testApplicationNames], deadline);
        if (activeCliCancel) await activeCliCancel(deadline);
      } catch (error) {
        note(error);
      }
    }
    try {
      await raceDeadline(
        holder.$disconnect(),
        Math.min(CANCEL_IO_MS, Math.max(0, left())),
        "holder disconnect exceeded the runBehindHold budget",
      );
    } catch (error) {
      note(error);
    }
    try {
      await raceDeadline(
        looker.$disconnect(),
        Math.min(CANCEL_IO_MS, Math.max(0, left())),
        "looker disconnect exceeded the runBehindHold budget",
      );
    } catch (error) {
      note(error);
    }
    if (notes.length > 0) {
      const extraText = notes.join("; ");
      if (primary instanceof Error) {
        primary.message = `${primary.message}; ${extraText}`;
      } else if (primary === null) {
        throw new Error(extraText);
      }
    }
  }
}

async function insertNullTasks(
  vineyardId: string,
  rowId: string,
  count: number,
  at: Date,
): Promise<string[]> {
  const name = registerWorkerName(`vmin${Math.random().toString(16).slice(2, 10)}`);
  const extra = new PrismaClient({
    datasources: { db: { url: withApplicationName(databaseUrl, name) } },
  });
  const ids: string[] = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const created = await extra.task.create({
        data: taskData(vineyardId, at, { rowId, title: `added-${index}` }),
      });
      ids.push(created.id);
    }
    return ids;
  } finally {
    const disconnecting = extra.$disconnect();
    observeRejection(disconnecting);
    await raceDeadline(disconnecting, CANCEL_IO_MS, "insertNullTasks disconnect timed out");
  }
}

async function caseA1CliSkippedRerun(prisma: PrismaClient, ownerId: string): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const vine = await createRow(prisma, vineyard.id, "A1");
  const season2019 = await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2019, status: "legacy" },
  });
  await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2020, status: "legacy" },
  });
  const at = new Date("2020-06-01T00:00:00.000Z");
  const task = await prisma.task.create({
    data: taskData(vineyard.id, at, { rowId: vine.id }),
  });
  const ordinal = await liveOrdinal(prisma, vineyard.id);
  await assertOnlyCaseTags([ordinal]);

  const first = await runBehindHold({
    rowIds: [task.id],
    start: () => spawnApplyCli(),
    mutate: (tx) => assignSeason(tx, "tasks", task.id, season2019.id),
  });
  const safeErr = first.stderr.replaceAll(databaseUrl, "[redacted]");
  assert.equal(first.code, 2, safeErr.slice(0, 500));
  assert.equal(
    textLines(first.stderr).includes("skipped_concurrent>0: rerun required"),
    true,
  );
  assert.equal(
    first.stdout.includes(
      `vineyard=${ordinal} year=2020 table=tasks reason=skipped_concurrent count=1`,
    ),
    true,
  );
  assert.equal(
    ordinalLines(first.stdout, ordinal).some((line) => line.includes("reason=tag")),
    false,
  );
  assertNoSecrets(first.stdout, first.stderr);
  const kept = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(kept.seasonId, season2019.id);
  assert.equal(kept.dueAt.toISOString(), at.toISOString());

  const second = await spawnApplyCli();
  assert.equal(second.code, 0, second.stderr.replaceAll(databaseUrl, "[redacted]").slice(0, 500));
  assert.equal(second.stdout.includes("reason=skipped_concurrent"), false);
  assert.equal(second.stderr.includes("rerun required"), false);
  assertNoSecrets(second.stdout, second.stderr);

  const third = await spawnApplyCli();
  assert.equal(third.code, 0, third.stderr.replaceAll(databaseUrl, "[redacted]").slice(0, 500));
  const thirdOwn = ordinalLines(third.stdout, ordinal);
  assert.equal(thirdOwn.some((line) => line.includes("reason=tag")), false);
  assert.equal(thirdOwn.some((line) => line.includes("reason=create_")), false);
  assertNoSecrets(third.stdout, third.stderr);
}

async function caseA2MaxTagBatches(prisma: PrismaClient, ownerId: string): Promise<void> {
  const at = new Date("2018-06-01T00:00:00.000Z");
  const v1 = await createVineyard(prisma, ownerId, "UTC");
  const v2 = await createVineyard(prisma, ownerId, "UTC");
  const row1 = await createRow(prisma, v1.id, "A2");
  const row2 = await createRow(prisma, v2.id, "A2");
  const task1 = await prisma.task.create({ data: taskData(v1.id, at, { rowId: row1.id }) });
  const task2 = await prisma.task.create({ data: taskData(v2.id, at, { rowId: row2.id }) });
  const ordinal1 = await liveOrdinal(prisma, v1.id);
  const ordinal2 = await liveOrdinal(prisma, v2.id);
  const byOrdinal = [
    { vineyardId: v1.id, ordinal: ordinal1, taskId: task1.id },
    { vineyardId: v2.id, ordinal: ordinal2, taskId: task2.id },
  ].sort((left, right) => left.ordinal - right.ordinal);
  const first = byOrdinal[0];
  const second = byOrdinal[1];
  assert.ok(first && second);
  await assertOnlyCaseTags([first.ordinal, second.ordinal]);

  const cappedNone = await runBackfill({
    databaseUrl,
    mode: "apply",
    batchSize: 1,
    maxTagBatches: 0,
  });
  assert.equal(countReason(cappedNone, first.ordinal, "tag"), 0);
  assert.equal(countReason(cappedNone, second.ordinal, "tag"), 0);
  assert.equal(hasCreateLine(cappedNone, second.ordinal), false);
  assert.equal(await prisma.season.count({ where: { vineyardId: second.vineyardId } }), 0);
  assert.equal(cappedNone.some((line) => line.reason === "skipped_concurrent"), false);
  assert.equal(backfillCompletion(cappedNone).exitCode, 0);
  const stillNull = await prisma.task.findMany({
    where: { id: { in: [first.taskId, second.taskId] } },
  });
  assert.equal(stillNull.every((task) => task.seasonId == null), true);

  const capNow = new Date("2026-06-15T17:00:00.000Z");
  const cappedOne = await runBackfill({
    databaseUrl,
    mode: "apply",
    batchSize: 1,
    maxTagBatches: 1,
    now: capNow,
  });
  assert.equal(countReason(cappedOne, first.ordinal, "tag"), 1);
  assert.equal(countReason(cappedOne, second.ordinal, "tag"), 0);
  // the cap limits tag batches; a visited vineyard's seasons are created and reported
  const secondSeasons = await prisma.season.findMany({
    where: { vineyardId: second.vineyardId },
    select: { year: true, status: true },
  });
  const currentYear = localYear(capNow, "UTC");
  assert.deepEqual(createYears(cappedOne, second.ordinal), secondSeasons.map((season) => season.year).sort((left, right) => left - right));
  assert.deepEqual(
    secondSeasons.map((season) => ({ year: season.year, status: season.status })).sort((left, right) => left.year - right.year),
    [
      { year: 2018, status: "legacy" },
      { year: currentYear, status: "active" },
    ],
  );
  assert.equal(cappedOne.some((line) => line.reason === "skipped_concurrent"), false);
  assert.equal(backfillCompletion(cappedOne).exitCode, 0);
  const secondStill = await prisma.task.findUniqueOrThrow({ where: { id: second.taskId } });
  assert.equal(secondStill.seasonId, null);

  const finished = await runBackfill({ databaseUrl, mode: "apply" });
  assert.equal(finished.some((line) => line.reason === "skipped_concurrent"), false);
  assert.equal(backfillCompletion(finished).exitCode, 0);
  const taggedSecond = await prisma.task.findUniqueOrThrow({ where: { id: second.taskId } });
  assert.ok(taggedSecond.seasonId);

  const rerun = await runBackfill({ databaseUrl, mode: "apply" });
  assert.equal(countReason(rerun, first.ordinal, "tag"), 0);
  assert.equal(countReason(rerun, second.ordinal, "tag"), 0);
  assert.equal(hasCreateLine(rerun, first.ordinal), false);
  assert.equal(hasCreateLine(rerun, second.ordinal), false);

  const v3 = await createVineyard(prisma, ownerId, "UTC");
  const row3 = await createRow(prisma, v3.id, "A2");
  const season2017 = await prisma.season.create({
    data: { vineyardId: v3.id, year: 2017, status: "legacy" },
  });
  const held = await prisma.task.create({ data: taskData(v3.id, at, { rowId: row3.id, title: "t1" }) });
  await prisma.task.create({ data: taskData(v3.id, at, { rowId: row3.id, title: "t2" }) });
  const v3b = await createVineyard(prisma, ownerId, "UTC");
  const row3b = await createRow(prisma, v3b.id, "A2B");
  for (let index = 0; index < 3; index += 1) {
    await prisma.task.create({
      data: taskData(v3b.id, at, { rowId: row3b.id, title: `b${index}` }),
    });
  }
  const ordinal3 = await liveOrdinal(prisma, v3.id);
  const ordinal3b = await liveOrdinal(prisma, v3b.id);
  assert.ok(ordinal3b > ordinal3);
  await assertOnlyCaseTags([ordinal3, ordinal3b]);
  const skippedCap = await runBehindHold({
    rowIds: [held.id],
    start: () =>
      runBackfill({ databaseUrl, mode: "apply", batchSize: 1, maxTagBatches: 3 }),
    mutate: (tx) => assignSeason(tx, "tasks", held.id, season2017.id),
  });
  assert.ok(countReason(skippedCap, ordinal3, "skipped_concurrent") >= 1);
  assert.equal(backfillCompletion(skippedCap).exitCode, 2);
  const v3bTag = countReason(skippedCap, ordinal3b, "tag");
  assert.equal(v3bTag >= 1 && v3bTag <= 2, true);
  assert.equal(countReason(skippedCap, ordinal3b, "skipped_concurrent"), 0);
  const v3bOpen = await prisma.task.count({ where: { vineyardId: v3b.id, seasonId: null } });
  assert.ok(v3bOpen >= 1);
  const keptHeld = await prisma.task.findUniqueOrThrow({ where: { id: held.id } });
  assert.equal(keptHeld.seasonId, season2017.id);
  const afterSkip = await runBackfill({ databaseUrl, mode: "apply" });
  assert.equal(afterSkip.some((line) => line.reason === "skipped_concurrent"), false);
  assert.equal(backfillCompletion(afterSkip).exitCode, 0);
  const v3bDone = await prisma.task.findMany({ where: { vineyardId: v3b.id } });
  assert.equal(v3bDone.length, 3);
  assert.equal(v3bDone.every((task) => task.seasonId != null), true);
}

async function caseA3InsertBeforeAndDuring(prisma: PrismaClient, ownerId: string): Promise<void> {
  const at = new Date("2019-06-01T00:00:00.000Z");
  const v4 = await createVineyard(prisma, ownerId, "UTC");
  const row4 = await createRow(prisma, v4.id, "A3");
  const season = await prisma.season.create({
    data: { vineyardId: v4.id, year: 2019, status: "legacy" },
  });
  const season2018 = await prisma.season.create({
    data: { vineyardId: v4.id, year: 2018, status: "legacy" },
  });
  const preassigned = await prisma.task.create({
    data: taskData(v4.id, at, { rowId: row4.id, seasonId: season.id, title: "pre" }),
  });
  const sentinel = await prisma.task.create({
    data: taskData(v4.id, at, { rowId: row4.id, seasonId: season2018.id, title: "sentinel" }),
  });
  for (let index = 0; index < 3; index += 1) {
    await prisma.task.create({
      data: taskData(v4.id, at, { rowId: row4.id, title: `n${index}` }),
    });
  }
  const ordinal4 = await liveOrdinal(prisma, v4.id);
  const planned = await runBackfill({ databaseUrl, mode: "dry-run" });
  const allowed = new Set([ordinal4]);
  assert.deepEqual(
    planned
      .filter((line) => line.reason === "tag" && !allowed.has(line.vineyardOrdinal))
      .map((line) => formatBackfillLine(line)),
    [],
  );
  assert.equal(countReason(planned, ordinal4, "tag"), 3);
  await insertNullTasks(v4.id, row4.id, 2, at);
  const applied = await runBackfill({ databaseUrl, mode: "apply" });
  assert.equal(countReason(applied, ordinal4, "tag"), 5);
  assert.equal(countReason(applied, ordinal4, "skipped_concurrent"), 0);
  assert.equal(backfillCompletion(applied).exitCode, 0);
  const preStill = await prisma.task.findUniqueOrThrow({ where: { id: preassigned.id } });
  assert.equal(preStill.seasonId, season.id);
  const sentinelStill = await prisma.task.findUniqueOrThrow({ where: { id: sentinel.id } });
  assert.equal(sentinelStill.seasonId, season2018.id);
  const rerun4 = await runBackfill({ databaseUrl, mode: "apply" });
  assert.equal(countReason(rerun4, ordinal4, "tag"), 0);

  const v5 = await createVineyard(prisma, ownerId, "UTC");
  const row5 = await createRow(prisma, v5.id, "A3");
  const season5 = await prisma.season.create({
    data: { vineyardId: v5.id, year: 2019, status: "legacy" },
  });
  const originals: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const created = await prisma.task.create({
      data: taskData(v5.id, at, { rowId: row5.id, title: `d${index}` }),
    });
    originals.push(created.id);
  }
  const ordinal5 = await liveOrdinal(prisma, v5.id);
  await assertOnlyCaseTags([ordinal5]);
  const before = await prisma.task.findMany({
    where: { vineyardId: v5.id },
    select: { id: true, seasonId: true },
  });
  assert.equal(before.length, 3);
  const beforeSeason = new Map(before.map((task) => [task.id, task.seasonId]));
  let inserted: string[] = [];
  const during = await runBehindHold({
    rowIds: [originals[0] ?? ""],
    start: () => runBackfill({ databaseUrl, mode: "apply", batchSize: 1 }),
    beforeRelease: async () => {
      inserted = await insertNullTasks(v5.id, row5.id, 2, at);
    },
  });
  assert.equal(countReason(during, ordinal5, "skipped_concurrent"), 0);
  const duringTag = countReason(during, ordinal5, "tag");
  assert.equal(duringTag >= 3 && duringTag <= 5, true);
  const after = await prisma.task.findMany({ where: { vineyardId: v5.id } });
  assert.equal(after.length, 5);
  const nonnull = after.filter((task) => task.seasonId != null);
  assert.equal(nonnull.length, duringTag);
  assert.equal(nonnull.every((task) => task.seasonId === season5.id), true);
  assert.equal(inserted.length, 2);
  const allowedIds = new Set<string>([...originals, ...inserted]);
  assert.equal(
    nonnull.every((task) => allowedIds.has(task.id)),
    true,
  );
  for (const task of after) {
    const previous = beforeSeason.get(task.id);
    if (previous != null) assert.equal(task.seasonId, previous);
    if (task.seasonId != null) assert.equal(task.seasonId, season5.id);
  }
  const nullAfterFirst = after.filter((task) => task.seasonId == null).length;
  assert.equal(nullAfterFirst, 5 - duringTag);
  const rerun5 = await runBackfill({ databaseUrl, mode: "apply" });
  const rerunTag = countReason(rerun5, ordinal5, "tag");
  assert.equal(rerunTag, nullAfterFirst);
  assert.equal(backfillCompletion(rerun5).exitCode, 0);
  const rerunRows = await prisma.task.findMany({ where: { vineyardId: v5.id } });
  assert.equal(rerunRows.length, 5);
  assert.equal(rerunRows.every((task) => task.seasonId === season5.id), true);
  const third5 = await runBackfill({ databaseUrl, mode: "apply" });
  assert.equal(countReason(third5, ordinal5, "tag"), 0);
  console.log(`a3-during tag=${duringTag} rerunTag=${rerunTag} nullAfterFirst=${nullAfterFirst}`);
}

async function caseA4HeldCandidates(prisma: PrismaClient, ownerId: string): Promise<void> {
  const at = new Date("2019-06-01T00:00:00.000Z");
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const vine = await createRow(prisma, vineyard.id, "A4");
  const season2018 = await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2018, status: "legacy" },
  });
  const season2019 = await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2019, status: "legacy" },
  });
  const ids: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const created = await prisma.task.create({
      data: taskData(vineyard.id, at, { rowId: vine.id, title: `h${index}` }),
    });
    ids.push(created.id);
  }
  const ordinal = await liveOrdinal(prisma, vineyard.id);
  await assertOnlyCaseTags([ordinal]);
  const firstId = ids[0];
  const secondId = ids[1];
  assert.ok(firstId && secondId);
  const lines = await runBehindHold({
    rowIds: ids,
    start: () => runBackfill({ databaseUrl, mode: "apply", batchSize: 2 }),
    mutate: async (tx) => {
      await assignSeason(tx, "tasks", firstId, season2018.id);
      await assignSeason(tx, "tasks", secondId, season2018.id);
    },
  });
  const tagged = countReason(lines, ordinal, "tag");
  const skipped = countReason(lines, ordinal, "skipped_concurrent");
  assert.equal(tagged + skipped, 5);
  assert.equal(skipped >= 2, true);
  assert.equal(backfillCompletion(lines).exitCode, 2);
  const first = await prisma.task.findUniqueOrThrow({ where: { id: firstId } });
  const second = await prisma.task.findUniqueOrThrow({ where: { id: secondId } });
  assert.equal(first.seasonId, season2018.id);
  assert.equal(second.seasonId, season2018.id);
  const rest = await prisma.task.findMany({ where: { id: { in: ids.slice(2) } } });
  assert.equal(
    rest.every((task) => task.seasonId == null || task.seasonId === season2019.id),
    true,
  );
  const rerun = await runBackfill({ databaseUrl, mode: "apply" });
  assert.equal(countReason(rerun, ordinal, "skipped_concurrent"), 0);
  assert.equal(backfillCompletion(rerun).exitCode, 0);
  const restAfter = await prisma.task.findMany({ where: { id: { in: ids.slice(2) } } });
  assert.equal(restAfter.every((task) => task.seasonId === season2019.id), true);
  const third = await runBackfill({ databaseUrl, mode: "apply" });
  assert.equal(countReason(third, ordinal, "tag"), 0);
}

async function caseA5OverlappingApplies(prisma: PrismaClient, ownerId: string): Promise<void> {
  const at = new Date("2019-06-01T00:00:00.000Z");
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const vine = await createRow(prisma, vineyard.id, "A5");
  const season = await prisma.season.create({
    data: { vineyardId: vineyard.id, year: 2019, status: "legacy" },
  });
  const ids: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    const created = await prisma.task.create({
      data: taskData(vineyard.id, at, { rowId: vine.id, title: `o${index}` }),
    });
    ids.push(created.id);
  }
  const ordinal = await liveOrdinal(prisma, vineyard.id);
  await assertOnlyCaseTags([ordinal]);
  const now = new Date("2026-06-15T17:00:00.000Z");
  const workerSuffix = Math.random().toString(16).slice(2, 10);
  const nameA = registerWorkerName(`vma5a${workerSuffix}`);
  const nameB = registerWorkerName(`vma5b${workerSuffix}`);
  const [first, second] = await runBehindHold({
    rowIds: ids,
    barrier: "named",
    start: () => {
      const firstRun = runBackfill({
        databaseUrl: withApplicationName(databaseUrl, nameA),
        mode: "apply",
        batchSize: 1,
        now,
      });
      const secondRun = runBackfill({
        databaseUrl: withApplicationName(databaseUrl, nameB),
        mode: "apply",
        batchSize: 1,
        now,
      });
      return bothWorkers(firstRun, secondRun);
    },
    beforeRelease: ({ holderPid, looker, isCancelled }) =>
      waitForNamedWorkersBlocked(
        looker,
        holderPid,
        nameA,
        nameB,
        WORKER_BARRIER_MS,
        isCancelled,
      ),
  });
  const tasks = await prisma.task.findMany({ where: { vineyardId: vineyard.id } });
  assert.equal(tasks.length, 6);
  assert.equal(tasks.every((task) => task.seasonId === season.id), true);
  const seasons = await prisma.season.findMany({ where: { vineyardId: vineyard.id } });
  const current = localYear(now, "UTC");
  assert.equal(seasons.filter((item) => item.year === 2019).length, 1);
  assert.equal(seasons.every((item) => item.year === 2019 || item.year === current), true);
  assert.equal(new Set(seasons.map((item) => item.year)).size, seasons.length);
  const tagSum = countReason(first, ordinal, "tag") + countReason(second, ordinal, "tag");
  assert.equal(tagSum, 6);
  for (const lines of [first, second]) {
    if (lines.some((line) => line.reason === "skipped_concurrent" && line.count > 0)) {
      assert.equal(backfillCompletion(lines).exitCode, 2);
    }
  }
  const follow = await runBackfill({ databaseUrl, mode: "apply" });
  assert.equal(backfillCompletion(follow).exitCode, 0);
  assert.equal(countReason(follow, ordinal, "tag"), 0);
}

async function caseA6InvalidOptions(prisma: PrismaClient, ownerId: string): Promise<void> {
  const vineyard = await createVineyard(prisma, ownerId, "UTC");
  const vine = await createRow(prisma, vineyard.id, "A6");
  await prisma.task.create({
    data: taskData(vineyard.id, new Date("2019-06-01T00:00:00.000Z"), { rowId: vine.id }),
  });
  const ordinal = await liveOrdinal(prisma, vineyard.id);
  await assertOnlyCaseTags([ordinal]);
  const seasonsBefore = await prisma.season.count();
  const nullTasksBefore = await prisma.task.count({ where: { seasonId: null } });
  await assert.rejects(
    () => runBackfill({ databaseUrl, mode: "apply", batchSize: 0 }),
    (error: unknown) =>
      error instanceof Error && error.message === "batchSize must be a positive integer",
  );
  await assert.rejects(
    () => runBackfill({ databaseUrl, mode: "apply", maxTagBatches: -1 }),
    (error: unknown) =>
      error instanceof Error && error.message === "maxTagBatches must be a non-negative integer",
  );
  assert.equal(await prisma.season.count(), seasonsBefore);
  assert.equal(await prisma.task.count({ where: { seasonId: null } }), nullTasksBefore);
}
