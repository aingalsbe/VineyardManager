import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSeasonSnapshot,
  computeClosePreviewToken,
  evaluateMidSeasonWarning,
  summarizeSeasonWeatherDays,
  unavailableSeasonWeather,
} from "../src/modules/seasons/season-snapshot.js";
import { runDailyRainCheckForAllVineyards } from "../src/modules/weather/weather.service.js";
import { runScheduledDigestForAllVineyards } from "../src/modules/digest/digest.send.js";

test("evaluateMidSeasonWarning flags future open tasks and unreached milestones (D-18)", () => {
  const summer = evaluateMidSeasonWarning({
    seasonYear: 2026,
    asOfDate: "2026-07-15",
    openTaskDueDates: ["2026-09-10"],
  });
  assert.equal(summer.midSeason, true);
  assert.ok(summer.midSeasonReason?.includes("1 open task"));
  assert.ok(summer.midSeasonReason?.includes("harvest window"));

  const autumn = evaluateMidSeasonWarning({
    seasonYear: 2026,
    asOfDate: "2026-10-05",
    openTaskDueDates: [],
  });
  assert.equal(autumn.midSeason, true);
  assert.ok(autumn.midSeasonReason?.includes("winterize"));

  const lateNov = evaluateMidSeasonWarning({
    seasonYear: 2026,
    asOfDate: "2026-11-15",
    openTaskDueDates: ["2026-11-01"],
  });
  assert.equal(lateNov.midSeason, false);
  assert.equal(lateNov.midSeasonReason, null);
});

test("computeClosePreviewToken changes whenever counted records change (A5)", () => {
  const t1 = new Date("2026-07-01T12:00:00.000Z");
  const t2 = new Date("2026-07-02T12:00:00.000Z");
  const base = {
    seasonId: "s1",
    openTasks: [{ id: "task-1", updatedAt: t1 }],
    tasks: [{ id: "task-1", updatedAt: t1 }],
    harvests: [{ id: "h-1", updatedAt: t1 }],
    activities: [{ id: "a-1", updatedAt: t1 }],
    untaggedOpenTaskCount: 0,
  };
  const tokA = computeClosePreviewToken(base);
  const tokA2 = computeClosePreviewToken({ ...base });
  assert.equal(tokA, tokA2);

  const tokChangedTask = computeClosePreviewToken({
    ...base,
    openTasks: [{ id: "task-1", updatedAt: t2 }],
  });
  assert.notEqual(tokA, tokChangedTask);

  const tokAddedHarvest = computeClosePreviewToken({
    ...base,
    harvests: [
      { id: "h-1", updatedAt: t1 },
      { id: "h-2", updatedAt: t2 },
    ],
  });
  assert.notEqual(tokA, tokAddedHarvest);
});

test("buildSeasonSnapshot computes exact harvests, tasks, activities, and untreated pest observations", () => {
  const closedAt = new Date("2026-11-15T18:00:00.000Z");
  const snapshot = buildSeasonSnapshot({
    vineyardId: "v1",
    vineyardName: "Abide Vineyard",
    timeZone: "America/Chicago",
    varietyCatalog: ["Norton", "Chardonel"],
    healthThresholds: { greenMin: 80, yellowMin: 70, orangeMin: 60 },
    seasonId: "s-2026",
    year: 2026,
    startedAt: new Date("2026-03-01T18:00:00.000Z"),
    closedAt,
    rows: [
      {
        id: "r1",
        code: "L1",
        name: "North 1",
        variety: "Norton",
        status: "active",
        deletedAt: null,
      },
      {
        id: "r2",
        code: "L2",
        name: "North 2",
        variety: "Chardonel",
        status: "active",
        deletedAt: null,
      },
    ],
    tasks: [
      // Done on time
      {
        id: "t1",
        rowId: "r1",
        title: "Dormant prune",
        dueAt: new Date("2026-03-10T17:00:00.000Z"),
        status: "acknowledged",
        updatedAt: new Date("2026-03-09T17:00:00.000Z"),
        rowCode: "L1",
      },
      // Done late
      {
        id: "t2",
        rowId: null,
        title: "Spring feed",
        dueAt: new Date("2026-04-20T17:00:00.000Z"),
        status: "acknowledged",
        updatedAt: new Date("2026-04-25T17:00:00.000Z"),
        rowCode: null,
      },
      // Dismissed earlier
      {
        id: "t3",
        rowId: null,
        title: "Old note",
        dueAt: new Date("2026-05-01T17:00:00.000Z"),
        status: "dismissed",
        updatedAt: new Date("2026-05-01T17:00:00.000Z"),
        rowCode: null,
      },
      // Still open -> dismissed by close
      {
        id: "t4",
        rowId: "r2",
        title: "Winterize",
        dueAt: new Date("2026-11-10T18:00:00.000Z"),
        status: "pending",
        updatedAt: new Date("2026-03-01T18:00:00.000Z"),
        rowCode: "L2",
      },
    ],
    harvests: [
      {
        id: "h1",
        rowId: "r1",
        yieldAmount: 100,
        yieldUnit: "lb",
        updatedAt: new Date("2026-09-15T17:00:00.000Z"),
      },
      {
        id: "h2",
        rowId: "r1",
        yieldAmount: 5,
        yieldUnit: "lug",
        updatedAt: new Date("2026-09-16T17:00:00.000Z"),
      },
    ],
    previousSeasonYear: 2025,
    previousHarvests: [
      {
        id: "ph1",
        rowId: "r1",
        yieldAmount: 80,
        yieldUnit: "lb",
        updatedAt: new Date("2025-09-15T17:00:00.000Z"),
      },
    ],
    activities: [
      {
        id: "a1",
        rowId: null,
        scopeType: "vineyard",
        activityType: "watering",
        performedAt: new Date("2026-07-01T17:00:00.000Z"),
        updatedAt: new Date("2026-07-01T17:00:00.000Z"),
        details: {},
        rowCode: null,
      },
      {
        id: "a2",
        rowId: "r1",
        scopeType: "row",
        activityType: "health_observation",
        performedAt: new Date("2026-06-10T17:00:00.000Z"),
        updatedAt: new Date("2026-06-10T17:00:00.000Z"),
        details: { pests: ["Japanese beetle"], notes: "Heavy beetle pressure" },
        rowCode: "L1",
      },
      // Treatment 20 days later (> 14 days!) -> does not clear the observation
      {
        id: "a3",
        rowId: "r1",
        scopeType: "row",
        activityType: "pest_prevention",
        performedAt: new Date("2026-06-30T17:00:00.000Z"),
        updatedAt: new Date("2026-06-30T17:00:00.000Z"),
        details: {},
        rowCode: "L1",
      },
    ],
    currentHealth: { score: 88, color: "green", reasons: [] },
    weather: unavailableSeasonWeather(),
  });

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.harvests.totalLb, 100);
  assert.equal(snapshot.harvests.skippedNonLb, 1);
  assert.equal(snapshot.harvests.previousTotalLb, 80);
  assert.equal(snapshot.tasks.total, 4);
  assert.equal(snapshot.tasks.doneOnTime, 1);
  assert.equal(snapshot.tasks.doneLate, 1);
  assert.equal(snapshot.tasks.dismissedBeforeClose, 1);
  assert.equal(snapshot.tasks.dismissedByClose, 1);
  assert.equal(snapshot.tasks.dismissedByCloseList[0]?.id, "t4");
  assert.equal(snapshot.activities.waterings, 1);
  assert.equal(snapshot.activities.pestTreatments, 1);
  assert.equal(snapshot.activities.pestObservationsWithoutTreatment14d.length, 1);
  assert.equal(
    snapshot.activities.pestObservationsWithoutTreatment14d[0]?.activityId,
    "a2",
  );
  assert.equal(snapshot.activeRows.length, 2);
});

test("summarizeSeasonWeatherDays counts frost, heavy rain, and 14-day dry spells", () => {
  const days = Array.from({ length: 20 }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    return {
      date: `2026-05-${day}`,
      tempMaxF: 75,
      tempMinF: i < 2 ? 30 : 55,
      precipInches: i === 2 ? 1.5 : 0.0,
      windMphMax: 10,
    };
  });
  const summary = summarizeSeasonWeatherDays(days, "2026-05-01", "2026-05-20");
  assert.equal(summary.available, true);
  assert.equal(summary.frostDays, 2);
  assert.equal(summary.heavyRainDays, 1);
  // Days 4..20 = 17 consecutive dry days -> 1 dry spell
  assert.equal(summary.drySpells, 1);
});

test("daily rain check and weekly digest all-vineyard runners skip dormant vineyards (A8)", async () => {
  const vineyards = [
    { id: "v-active", name: "Active" },
    { id: "v-dormant", name: "Dormant" },
  ];
  const isDormant = async (id: string) => id === "v-dormant";

  const rainRan: string[] = [];
  const rainResults = await runDailyRainCheckForAllVineyards({
    deps: {
      listVineyards: async () => vineyards,
      isDormant,
      runCheck: async (id) => {
        rainRan.push(id);
        return {
          vineyardId: id,
          vineyardName: "Active",
          checkDate: "2026-07-01",
          timeZone: "America/Chicago",
          lat: 38.9,
          lng: -92.3,
          geocoded: false,
          rainInches: 0,
          thresholdInches: 0.5,
          windowStart: "",
          windowEnd: "",
          provider: "open-meteo",
          triggered: false,
          activityCreated: false,
          skippedReason: "below_threshold",
          activity: null,
        };
      },
    },
  });
  assert.deepEqual(rainRan, ["v-active"]);
  assert.equal(rainResults.length, 1);

  const digestRan: string[] = [];
  const digestResults = await runScheduledDigestForAllVineyards(
    new Date("2026-07-06T12:00:00.000Z"),
    {
      listVineyards: async () => vineyards,
      isDormant,
      runDigest: async (id) => {
        digestRan.push(id);
        return {
          vineyardId: id,
          vineyardName: "Active",
          weekStart: "2026-07-06",
          eligible: 0,
          optedOut: 0,
          sent: 0,
          failed: 0,
          skipped: 0,
          alreadyLogged: 0,
          recipients: [],
        };
      },
    },
  );
  assert.deepEqual(digestRan, ["v-active"]);
  assert.equal(digestResults.length, 1);
});
