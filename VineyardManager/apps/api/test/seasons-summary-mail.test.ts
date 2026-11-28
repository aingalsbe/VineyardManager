import assert from "node:assert/strict";
import test from "node:test";
import type { SeasonSnapshot } from "@vineyard/shared";
import { buildSeasonSnapshot } from "../src/modules/seasons/season-snapshot.js";
import { buildSeasonSummaryFromSnapshot } from "../src/modules/seasons/season-summary.js";
import {
  allowlistMailErrorCode,
  dispatchPendingSeasonSummaryMails,
  renderSeasonSummaryEmail,
  resetSummaryMailBackoffForTests,
  selectSeasonSummaryRecipients,
  wantsSeasonSummaryEmail,
} from "../src/modules/seasons/season-summary-mail.js";

function baseSnapshot(overrides: Partial<SeasonSnapshot> = {}): SeasonSnapshot {
  return {
    schemaVersion: 1,
    vineyardId: "v-1",
    vineyardName: "Hillside Vineyard",
    timeZone: "America/Chicago",
    seasonId: "s-1",
    year: 2026,
    startedAt: "2026-03-01T18:00:00.000Z",
    closedAt: "2026-11-15T18:00:00.000Z",
    asOfDate: "2026-11-15",
    health: {
      score: 75,
      color: "yellow",
      reasons: [{ code: "ok", message: "Minor tasks", severity: "yellow" }],
    },
    activeRows: [
      { rowId: "r-1", code: "L1", name: "Line 1", variety: "Norton" },
    ],
    harvests: {
      unit: "lb",
      totalLb: 110,
      skippedNonLb: 1,
      byVariety: [{ variety: "Norton", totalLb: 110 }],
      byRow: [{ rowId: "r-1", code: "L1", name: "Line 1", variety: "Norton", totalLb: 110 }],
      previousSeasonYear: 2025,
      previousTotalLb: 100,
      previousByVariety: [{ variety: "Norton", totalLb: 100 }],
      previousByRow: [{ rowId: "r-1", code: "L1", totalLb: 100 }],
    },
    activities: {
      waterings: 12,
      fertilizing: 2,
      pestTreatments: 3,
      weedTreatments: 4,
      pestObservationsWithoutTreatment14d: [],
    },
    tasks: {
      total: 10,
      doneOnTime: 9,
      doneLate: 1,
      dismissedBeforeClose: 0,
      dismissedByClose: 0,
      dismissedByCloseList: [],
    },
    weather: {
      available: true,
      unavailableReason: null,
      frostDays: 4,
      heavyRainDays: 2,
      drySpells: 1,
      dateStart: "2026-01-01",
      dateEnd: "2026-11-15",
    },
    ...overrides,
  };
}

test("C1/C2: summary numbers match snapshot exactly and respect rule boundaries (+10%, 90%, 14d)", () => {
  // Exactly +10% harvest (110 vs 100) -> NOT flagged positive (>10% required);
  // Exactly 90% tasks on time (9/10) -> IS flagged positive (>=90%);
  // Yellow health -> neither positive nor negative.
  const snapExact = baseSnapshot();
  const sumExact = buildSeasonSummaryFromSnapshot(snapExact, 1);

  assert.equal(sumExact.harvests.totalLb, snapExact.harvests.totalLb);
  assert.equal(sumExact.harvests.skippedNonLb, snapExact.harvests.skippedNonLb);
  assert.equal(sumExact.harvests.previousTotalLb, snapExact.harvests.previousTotalLb);
  assert.equal(sumExact.harvests.deltaPct, 10);
  assert.equal(sumExact.work.waterings, snapExact.activities.waterings);
  assert.equal(sumExact.work.fertilizing, snapExact.activities.fertilizing);
  assert.equal(sumExact.work.pestTreatments, snapExact.activities.pestTreatments);
  assert.equal(sumExact.work.weedTreatments, snapExact.activities.weedTreatments);
  assert.equal(sumExact.tasks.doneOnTime, snapExact.tasks.doneOnTime);
  assert.equal(sumExact.tasks.doneLate, snapExact.tasks.doneLate);
  assert.equal(sumExact.tasks.onTimePct, 90);
  assert.equal(sumExact.weather.frostDays, snapExact.weather.frostDays);
  assert.equal(sumExact.weather.heavyRainDays, snapExact.weather.heavyRainDays);
  assert.equal(sumExact.weather.drySpells, snapExact.weather.drySpells);

  assert.equal(
    sumExact.positives.some((p) => p.code === "harvest_up"),
    false,
    "exact +10% should not trigger harvest_up (>10%)",
  );
  assert.equal(
    sumExact.positives.some((p) => p.code === "tasks_on_time"),
    true,
    "exact 90% should trigger tasks_on_time (>=90%)",
  );
  assert.equal(sumExact.negatives.length, 0);

  // +10.1% harvest triggers harvest_up; 89.9% tasks on time does NOT trigger tasks_on_time
  const sumAbove = buildSeasonSummaryFromSnapshot(
    baseSnapshot({
      harvests: { ...baseSnapshot().harvests, totalLb: 110.1, previousTotalLb: 100 },
      tasks: { ...baseSnapshot().tasks, doneOnTime: 899, doneLate: 101, total: 1000 },
      health: { score: 88, color: "green", reasons: [] },
    }),
    1,
  );
  assert.equal(sumAbove.positives.some((p) => p.code === "harvest_up"), true);
  assert.equal(sumAbove.positives.some((p) => p.code === "tasks_on_time"), false);
  assert.equal(sumAbove.positives.some((p) => p.code === "health_green"), true);

  // Exact -10% harvest -> NOT negative; -10.1% -> IS negative; zero-harvest active row & red health -> negative
  const sumMinus10 = buildSeasonSummaryFromSnapshot(
    baseSnapshot({
      harvests: { ...baseSnapshot().harvests, totalLb: 90, previousTotalLb: 100 },
    }),
    1,
  );
  assert.equal(sumMinus10.negatives.some((n) => n.code === "harvest_down"), false);

  const sumMinus101 = buildSeasonSummaryFromSnapshot(
    baseSnapshot({
      activeRows: [
        { rowId: "r-1", code: "L1", name: "Line 1", variety: "Norton" },
        { rowId: "r-2", code: "L2", name: "Line 2", variety: "Chardonel" },
      ],
      harvests: { ...baseSnapshot().harvests, totalLb: 89.9, previousTotalLb: 100 },
      health: { score: 52, color: "red", reasons: [] },
      weather: {
        available: false,
        unavailableReason: "Weather not available",
        frostDays: 0,
        heavyRainDays: 0,
        drySpells: 0,
        dateStart: null,
        dateEnd: null,
      },
    }),
    1,
  );
  assert.equal(sumMinus101.negatives.some((n) => n.code === "harvest_down"), true);
  assert.equal(sumMinus101.negatives.some((n) => n.code === "zero_harvest_row"), true);
  assert.equal(sumMinus101.negatives.some((n) => n.code === "health_low"), true);
  assert.equal(sumMinus101.weather.available, false);
  assert.equal(sumMinus101.weather.note, "Weather not available");
});

test("C1: pest observation 14-day boundary (day 14 treated OK, day 15 flagged negative)", () => {
  const buildWithTreatmentDate = (treatIso: string) => {
    const snap = buildSeasonSnapshot({
      vineyardId: "v-1",
      vineyardName: "Hillside",
      timeZone: "America/Chicago",
      varietyCatalog: ["Norton"],
      healthThresholds: null,
      seasonId: "s-1",
      year: 2026,
      startedAt: new Date("2026-03-01T18:00:00.000Z"),
      closedAt: new Date("2026-11-15T18:00:00.000Z"),
      rows: [
        {
          id: "r-1",
          code: "L1",
          name: "Line 1",
          variety: "Norton",
          status: "active",
          deletedAt: null,
        },
      ],
      tasks: [],
      harvests: [
        {
          id: "h-1",
          rowId: "r-1",
          yieldAmount: 100,
          yieldUnit: "lb",
          updatedAt: new Date("2026-09-10T18:00:00.000Z"),
        },
      ],
      previousSeasonYear: null,
      previousHarvests: [],
      activities: [
        {
          id: "a-obs",
          rowId: "r-1",
          scopeType: "row",
          activityType: "health_observation",
          performedAt: new Date("2026-06-01T17:00:00.000Z"),
          updatedAt: new Date("2026-06-01T17:00:00.000Z"),
          details: { notes: "Japanese beetle damage on leaves" },
          rowCode: "L1",
        },
        {
          id: "a-treat",
          rowId: "r-1",
          scopeType: "row",
          activityType: "pest_prevention",
          performedAt: new Date(treatIso),
          updatedAt: new Date(treatIso),
          details: {},
          rowCode: "L1",
        },
      ],
      currentHealth: { score: 90, color: "green", reasons: [] },
      weather: {
        available: false,
        unavailableReason: "Weather not available",
        frostDays: 0,
        heavyRainDays: 0,
        drySpells: 0,
        dateStart: null,
        dateEnd: null,
      },
    });
    return buildSeasonSummaryFromSnapshot(snap, 1);
  };

  // Exactly 14 days later (June 1 -> June 15): treated in time
  const day14 = buildWithTreatmentDate("2026-06-15T17:00:00.000Z");
  assert.equal(
    day14.negatives.some((n) => n.code === "untreated_pest_observation"),
    false,
  );

  // 15 days later (June 1 -> June 16): flagged negative
  const day15 = buildWithTreatmentDate("2026-06-16T17:00:00.000Z");
  assert.equal(
    day15.negatives.some((n) => n.code === "untreated_pest_observation"),
    true,
  );
});

test("C3: renderSeasonSummaryEmail includes summary sections, blue palette, and safe links", () => {
  const summary = buildSeasonSummaryFromSnapshot(baseSnapshot(), 1);
  const rendered = renderSeasonSummaryEmail(summary, "https://vineyard.example.test");
  assert.equal(rendered.subject, "Hillside Vineyard — 2026 Season Summary");
  assert.match(rendered.html, /#215a96/);
  assert.match(rendered.html, /rel="noopener noreferrer"/);
  assert.match(rendered.html, /https:\/\/vineyard\.example\.test\/seasons\/s-1/);
  assert.match(rendered.html, /https:\/\/vineyard\.example\.test\/settings#notifications/);
  assert.match(rendered.text, /110 lb total/);
  assert.match(rendered.text, /4 frost days/);
});

test("C5 & D-07/D-09: recipient selection respects emailEnabled, ignores weeklyDigest=false, and filters test mode", () => {
  assert.equal(wantsSeasonSummaryEmail({ weeklyDigest: false }), true);
  assert.equal(wantsSeasonSummaryEmail({ emailEnabled: false }), false);

  const candidates = [
    { id: "u1", email: "allow@example.test", role: "power_user", notificationPrefs: { weeklyDigest: false } },
    { id: "u2", email: "other@example.test", role: "manager", notificationPrefs: {} },
    { id: "u3", email: "local@vineyard.local", role: "manager", notificationPrefs: {} },
    { id: "u4", email: "optedout@example.test", role: "manager", notificationPrefs: { emailEnabled: false } },
    { id: "u5", email: "viewer@example.test", role: "viewer", notificationPrefs: {} },
    { id: "u6", email: "disabled@example.test", role: "power_user", disabledAt: new Date(), notificationPrefs: {} },
  ];

  const testMode = selectSeasonSummaryRecipients(candidates, {
    mode: "test",
    testAllowlist: ["allow@example.test"],
  });
  assert.equal(testMode.length, 3);
  assert.deepEqual(
    testMode.map((r) => ({ email: r.recipientEmail, status: r.status, code: r.lastErrorCode })),
    [
      { email: "allow@example.test", status: "pending", code: null },
      { email: "other@example.test", status: "skipped", code: "TEST_MODE_FILTERED" },
      { email: "local@vineyard.local", status: "skipped", code: "LOCAL_ADDRESS" },
    ],
  );

  const liveMode = selectSeasonSummaryRecipients(candidates, {
    mode: "live",
    testAllowlist: [],
  });
  assert.deepEqual(
    liveMode.map((r) => ({ email: r.recipientEmail, status: r.status })),
    [
      { email: "allow@example.test", status: "pending" },
      { email: "other@example.test", status: "pending" },
      { email: "local@vineyard.local", status: "skipped" },
    ],
  );
});

test("C4 & C6: dispatcher retries with backoff, handles ambiguous-ack timeout, and redacts logs", async () => {
  resetSummaryMailBackoffForTests();
  assert.equal(allowlistMailErrorCode({ code: "ETIMEDOUT" }), "ETIMEDOUT");
  assert.equal(
    allowlistMailErrorCode(new Error("raw secret-recipient@example.test failure")),
    "SEND_FAILED",
  );

  const summary = buildSeasonSummaryFromSnapshot(baseSnapshot(), 1);
  const intentState = {
    id: "intent-1",
    seasonId: "s-1",
    vineyardId: "v-1",
    closeVersion: 1,
    recipientEmail: "secret-recipient@example.test",
    status: "pending" as "pending" | "sent" | "failed" | "skipped",
    attempts: 0,
    lastErrorCode: null as string | null,
    providerMessageId: null as string | null,
    sentAt: null as Date | null,
    season: {
      closeVersion: 1,
      summary,
      summaryHistory: [],
    },
  };

  const fakeDb = {
    seasonSummaryMail: {
      async findMany() {
        if (
          intentState.status === "pending" ||
          (intentState.status === "failed" && intentState.attempts < 3)
        ) {
          return [{ ...intentState }];
        }
        return [];
      },
      async update({ data }: { data: Partial<typeof intentState> }) {
        Object.assign(intentState, data);
        return { ...intentState };
      },
    },
  } as unknown as Parameters<typeof dispatchPendingSeasonSummaryMails>[0]["db"];

  const logs: string[] = [];
  let clockMs = Date.UTC(2026, 10, 15, 18, 0, 0);
  let callCount = 0;

  // Attempt 1: ambiguous-ack ETIMEDOUT -> marked failed, backoff scheduled
  const res1 = await dispatchPendingSeasonSummaryMails({
    db: fakeDb,
    now: () => new Date(clockMs),
    backoffMs: [0, 30_000, 120_000],
    logger: (line) => logs.push(line),
    transport: async () => {
      callCount += 1;
      const err = new Error("Timeout waiting for provider ack for secret-recipient@example.test");
      (err as { code?: string }).code = "ETIMEDOUT";
      throw err;
    },
  });
  assert.equal(res1.failed, 1);
  assert.equal(intentState.status, "failed");
  assert.equal(intentState.attempts, 1);
  assert.equal(intentState.lastErrorCode, "ETIMEDOUT");

  // Immediate re-run within backoff window -> deferred, transport NOT called
  clockMs += 5_000;
  const res2 = await dispatchPendingSeasonSummaryMails({
    db: fakeDb,
    now: () => new Date(clockMs),
    backoffMs: [0, 30_000, 120_000],
    logger: (line) => logs.push(line),
    transport: async () => {
      callCount += 1;
      return { sent: true, messageId: "msg-should-not-run" };
    },
  });
  assert.equal(res2.deferredByBackoff, 1);
  assert.equal(callCount, 1);

  // After backoff expires -> retry succeeds (documents at-least-once after ambiguous ack)
  clockMs += 30_000;
  const res3 = await dispatchPendingSeasonSummaryMails({
    db: fakeDb,
    now: () => new Date(clockMs),
    backoffMs: [0, 30_000, 120_000],
    logger: (line) => logs.push(line),
    transport: async () => {
      callCount += 1;
      return { sent: true, messageId: "msg-retry-ok" };
    },
  });
  assert.equal(res3.sent, 1);
  assert.equal(callCount, 2);
  assert.equal(intentState.status, "sent");
  assert.equal(intentState.attempts, 2);
  assert.equal(intentState.providerMessageId, "msg-retry-ok");

  // C6: Logs must contain NO email addresses, NO links, NO tokens, NO summary numbers (110 lb)
  assert.equal(logs.length, 2);
  for (const line of logs) {
    assert.equal(line.includes("secret-recipient@example.test"), false);
    assert.equal(line.includes("@"), false);
    assert.equal(line.includes("http"), false);
    assert.equal(line.includes("110"), false);
  }
});
