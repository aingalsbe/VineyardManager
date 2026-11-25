import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import {
  buildVineyardMetrics,
  scoreVineyardHealth,
  type HealthScoreActivityInput,
  type HealthScoreRowInput,
  type HealthScoreTaskInput,
  type MetricsHarvestInput,
  type MetricsRowInput,
} from "@vineyard/shared";

test("scoreVineyardHealth produces expected scores and reasons across row statuses and windows", () => {
  const asOf = new Date("2026-07-15T15:00:00.000Z");
  const rows: HealthScoreRowInput[] = [
    { id: "r1", code: "NS1", name: "North 1", status: "active" },
    { id: "r2", code: "NS2", name: "North 2", status: "fallow" },
    { id: "r3", code: "NS3", name: "North 3", status: "retired" },
  ];
  const tasks: HealthScoreTaskInput[] = [
    {
      id: "t1",
      rowId: "r1",
      title: "Prune shoots",
      dueAt: "2026-07-10T12:00:00.000Z",
      status: "pending",
    },
    {
      id: "t2",
      rowId: "r1",
      title: "Completed task ignored",
      dueAt: "2026-07-01T12:00:00.000Z",
      status: "acknowledged",
    },
    {
      id: "t3",
      rowId: "removed-row-id",
      title: "Check trellis",
      dueAt: "2026-07-12T12:00:00.000Z",
      status: "pending",
    },
  ];
  const activities: HealthScoreActivityInput[] = [
    {
      id: "a1",
      rowId: null,
      scopeType: "vineyard",
      activityType: "watering",
      performedAt: "2026-07-10T12:00:00.000Z",
      details: {},
    },
    {
      id: "a2",
      rowId: "r1",
      scopeType: "row",
      activityType: "pest_prevention",
      performedAt: "2026-07-05T12:00:00.000Z",
      details: {},
    },
    {
      id: "a3",
      rowId: "r1",
      scopeType: "row",
      activityType: "health_observation",
      performedAt: "2026-07-14T12:00:00.000Z",
      details: { notes: "Mild leaf yellowing" },
    },
  ];

  const scored = scoreVineyardHealth({
    rows,
    tasks,
    activities,
    asOf,
    timeZone: "America/Chicago",
  });

  const r1 = scored.rows.find((r) => r.rowId === "r1");
  const r2 = scored.rows.find((r) => r.rowId === "r2");
  const r3 = scored.rows.find((r) => r.rowId === "r3");

  // r1: 100 - 20 (overdue) - 10 (observation) = 70 (yellow)
  assert.equal(r1?.score, 70);
  assert.equal(r1?.color, "yellow");
  assert.equal(r1?.reasons[0]?.message, "Overdue: Prune shoots");
  assert.equal(r1?.reasons[1]?.message, "Mild leaf yellowing");

  // r2: fallow ceiling caps at 69 (orange); no pest/weed (-10) => 90 -> capped to 69
  assert.equal(r2?.score, 69);
  assert.equal(r2?.color, "orange");

  // r3: retired stays 100 green and excluded from vineyard average
  assert.equal(r3?.score, 100);
  assert.equal(r3?.color, "green");

  // Vineyard overall = round((70 + 69) / 2) = 70 (yellow), includes removed-row overdue task
  assert.equal(scored.vineyard.score, 70);
  assert.ok(
    scored.vineyard.reasons.some(
      (reason) => reason.message === "Removed row: Overdue: Check trellis",
    ),
  );
});

test("buildVineyardMetrics full-year series stays fast with 25 rows, 100 tasks, 400 activities", () => {
  const rows: MetricsRowInput[] = Array.from({ length: 25 }, (_, i) => ({
    id: `row-${i}`,
    code: `R${i + 1}`,
    name: `Row ${i + 1}`,
    variety: i % 2 === 0 ? "Norton" : "Chardonel",
    status: "active",
  }));
  const tasks: HealthScoreTaskInput[] = Array.from({ length: 100 }, (_, i) => ({
    id: `task-${i}`,
    rowId: `row-${i % 25}`,
    title: `Task ${i}`,
    dueAt: new Date(Date.UTC(2026, i % 10, 1 + (i % 25), 12)).toISOString(),
    status: i % 3 === 0 ? "pending" : "acknowledged",
  }));
  const activityTypes = [
    "watering",
    "pest_prevention",
    "weed_prevention",
    "pruning",
    "health_observation",
  ] as const;
  const activities: HealthScoreActivityInput[] = Array.from(
    { length: 400 },
    (_, i) => ({
      id: `act-${i}`,
      rowId: i % 5 === 0 ? null : `row-${i % 25}`,
      scopeType: i % 5 === 0 ? "vineyard" : "row",
      activityType: activityTypes[i % activityTypes.length]!,
      performedAt: new Date(
        Date.UTC(2026, i % 10, 1 + (i % 28), 12),
      ).toISOString(),
      details: {},
    }),
  );
  const harvests: MetricsHarvestInput[] = Array.from({ length: 150 }, (_, i) => ({
    rowId: `row-${i % 25}`,
    harvestedAt: new Date(
      Date.UTC(2024 + (i % 3), 8, 1 + (i % 20), 12),
    ).toISOString(),
    yieldAmount: 42.5,
    yieldUnit: "lb",
  }));

  const input = {
    vineyardId: "v1",
    timeZone: "America/Chicago",
    catalog: ["Norton", "Chardonel"],
    asOf: new Date("2026-10-15T15:00:00.000Z"),
    period: "year" as const,
    rows,
    tasks,
    activities,
    harvests,
  };

  // Warm up JIT and Intl timezone tables before timing.
  buildVineyardMetrics(input);

  const started = performance.now();
  const metrics = buildVineyardMetrics(input);
  const elapsedMs = performance.now() - started;

  assert.equal(metrics.health.rows.length, 25);
  assert.ok(metrics.health.series.length >= 40);
  assert.ok(metrics.harvests.currentTotal > 0);
  assert.ok(
    elapsedMs < 1000,
    `expected buildVineyardMetrics to complete in <1000ms after warmup, took ${elapsedMs.toFixed(1)}ms`,
  );
});
