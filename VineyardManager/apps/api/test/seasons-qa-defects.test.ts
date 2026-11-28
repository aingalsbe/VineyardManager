import assert from "node:assert/strict";
import test from "node:test";
import {
  ANNUAL_CALENDAR_TEMPLATES,
  calendarTemplateFamily,
  type SeasonSnapshot,
} from "@vineyard/shared";
import { formatLb, formatNumber } from "../src/lib/format-number.js";
import {
  buildLocationBasedSeasonCalendar,
  harvestSlugsForVarieties,
  resolveLocationTaskDefaults,
} from "../src/modules/seasons/season-calendar.js";
import {
  buildSeasonSnapshot,
  unavailableSeasonWeather,
} from "../src/modules/seasons/season-snapshot.js";
import { renderSeasonSummaryEmail } from "../src/modules/seasons/season-summary-mail.js";
import { buildSeasonSummaryFromSnapshot } from "../src/modules/seasons/season-summary.js";
import { earlierCloseDismissedTaskIds } from "../src/modules/seasons/seasons.service.js";
import type { OpenMeteoHistoryDay } from "../src/modules/weather/open-meteo.client.js";

function history(): OpenMeteoHistoryDay[] {
  const days: OpenMeteoHistoryDay[] = [];
  for (let y = 2016; y < 2026; y += 1) {
    for (let doy = 1; doy <= 365; doy += 1) {
      const d = new Date(Date.UTC(y, 0, 1) + (doy - 1) * 86_400_000);
      const date = d.toISOString().slice(0, 10);
      const avgF = 55 + 25 * Math.cos((2 * Math.PI * (doy - 200)) / 365);
      days.push({
        date,
        precipInches: 0.1,
        tempMaxF: avgF + 10,
        tempMinF: avgF - 10,
        windMphMax: 8,
      });
    }
  }
  return days;
}

test("D-A: calendarTemplateFamily maps fixed and location keys for the same work together", () => {
  assert.equal(calendarTemplateFamily("strip_weed_pass"), "strip_weed_pass");
  assert.equal(calendarTemplateFamily("strip_weed_pass_1"), "strip_weed_pass");
  assert.equal(calendarTemplateFamily("strip_weed_pass_2"), "strip_weed_pass");
  assert.equal(calendarTemplateFamily("pest_scouting"), "pest_scouting");
  assert.equal(calendarTemplateFamily("pest_scouting_4"), "pest_scouting");
  assert.equal(calendarTemplateFamily("harvest_window"), "harvest");
  assert.equal(calendarTemplateFamily("harvest_norton"), "harvest");
  assert.equal(calendarTemplateFamily("harvest_norton_2"), "harvest");
  // Keys with no alias are their own family and never collide.
  assert.equal(calendarTemplateFamily("vine_replacement_check"), "vine_replacement_check");
  assert.notEqual(
    calendarTemplateFamily("dormant_prune"),
    calendarTemplateFamily("spring_feed"),
  );
  assert.equal(calendarTemplateFamily("  pest_scouting_1 "), "pest_scouting");
});

test("D-A: every fixed template shares a family with the location calendar task it duplicates", () => {
  const cal = buildLocationBasedSeasonCalendar({
    targetYear: 2027,
    historyDays: history(),
    varieties: ["Norton", "Chardonel"],
    confirmedTags: {},
  });
  assert.ok(cal);
  const locationFamilies = new Set(
    cal.tasks.map((t) => calendarTemplateFamily(t.templateKey)),
  );
  for (const template of ANNUAL_CALENDAR_TEMPLATES) {
    assert.ok(
      locationFamilies.has(calendarTemplateFamily(template.templateKey)),
      `fixed template ${template.templateKey} must dedupe against the location calendar`,
    );
  }
});

test("D-B: resolveLocationTaskDefaults matches the location calendar's own title, body and activity for every task", () => {
  const varieties = ["Norton", "Chardonel", "Norton ", "Vidal Blanc", "vidal-blanc"];
  const cal = buildLocationBasedSeasonCalendar({
    targetYear: 2027,
    historyDays: history(),
    varieties,
    confirmedTags: {},
  });
  assert.ok(cal);
  let resolved = 0;
  for (const task of cal.tasks) {
    const defaults = resolveLocationTaskDefaults(task.templateKey, varieties);
    if (!defaults) continue; // keys shared with the fixed calendar resolve there
    resolved += 1;
    assert.equal(defaults.title, task.title, task.templateKey);
    assert.equal(defaults.body, task.body, task.templateKey);
    assert.equal(defaults.relatedActivityType, task.relatedActivityType, task.templateKey);
  }
  assert.ok(resolved >= 5, "weed passes, pest scouting and harvest windows must resolve");
});

test("D-B: resolveLocationTaskDefaults never returns a raw key as a title and handles edge keys", () => {
  assert.equal(
    resolveLocationTaskDefaults("strip_weed_pass_1", [])?.title,
    "Strip / weed pass (pre-bloom)",
  );
  assert.equal(
    resolveLocationTaskDefaults("strip_weed_pass_2", [])?.title,
    "Strip / weed pass (midsummer)",
  );
  assert.equal(resolveLocationTaskDefaults("pest_scouting_3", [])?.title, "Pest scouting #3");
  assert.equal(
    resolveLocationTaskDefaults("harvest_chambourcin", ["Chambourcin"])?.title,
    "Harvest window — Chambourcin",
  );
  // Unknown variety slug is humanized instead of shown raw.
  assert.equal(
    resolveLocationTaskDefaults("harvest_vidal_blanc", [])?.title,
    "Harvest window — Vidal Blanc",
  );
  // Shared keys and unknown keys are not handled here.
  assert.equal(resolveLocationTaskDefaults("harvest_window", []), null);
  assert.equal(resolveLocationTaskDefaults("spring_feed", []), null);
  assert.equal(resolveLocationTaskDefaults("something_custom", []), null);
  assert.deepEqual(
    harvestSlugsForVarieties(["Norton", "norton", "Norton!", " "]).map((v) => v.slug),
    ["norton", "norton_2", "norton_3"],
  );
});

test("Copy: pound figures use thousands separators everywhere in the summary and email", () => {
  assert.equal(formatNumber(5490), "5,490");
  assert.equal(formatNumber(15.5), "15.5");
  assert.equal(formatNumber(1234567.891), "1,234,567.89");
  assert.equal(formatLb(5490), "5,490 lb");
  assert.equal(formatLb(0), "0 lb");

  const snapshot = bigHarvestSnapshot();
  const summary = buildSeasonSummaryFromSnapshot(snapshot, 1);
  const all = JSON.stringify([summary.positives, summary.negatives]);
  assert.match(all, /15\.5 lb vs 5,490 lb/);
  assert.doesNotMatch(all, /\b5490 lb/);

  const rendered = renderSeasonSummaryEmail(summary, "https://vineyard.example.test");
  for (const body of [rendered.html, rendered.text]) {
    assert.match(body, /5,490 lb/);
    assert.doesNotMatch(body, /\b5490 lb/);
  }
});

function bigHarvestSnapshot(): SeasonSnapshot {
  const closedAt = new Date("2026-11-15T18:00:00.000Z");
  const base = buildSeasonSnapshot({
    vineyardId: "v1",
    vineyardName: "Abide Vineyard",
    timeZone: "America/Chicago",
    varietyCatalog: ["Norton"],
    healthThresholds: { greenMin: 80, yellowMin: 70, orangeMin: 60 },
    seasonId: "s-2026",
    year: 2026,
    startedAt: new Date("2026-03-01T18:00:00.000Z"),
    closedAt,
    rows: [
      { id: "r1", code: "L1", name: "North 1", variety: "Norton", status: "active", deletedAt: null },
    ],
    tasks: [],
    harvests: [
      { id: "h1", rowId: "r1", yieldAmount: 15.5, yieldUnit: "lb", updatedAt: closedAt },
    ],
    previousSeasonYear: 2025,
    previousHarvests: [
      { id: "ph1", rowId: "r1", yieldAmount: 5490, yieldUnit: "lb", updatedAt: closedAt },
    ],
    activities: [],
    currentHealth: { score: 75, color: "yellow", reasons: [] },
    weather: unavailableSeasonWeather(),
  });
  return base;
}

test("Copy-2: tasks dismissed by an earlier close are reported separately after reopen", () => {
  const closedAt = new Date("2026-11-20T18:00:00.000Z");
  const task = (id: string, status: "dismissed" | "pending" | "acknowledged") => ({
    id,
    rowId: null,
    title: `Task ${id}`,
    dueAt: new Date("2026-06-01T17:00:00.000Z"),
    status,
    updatedAt: new Date("2026-06-01T17:00:00.000Z"),
    rowCode: null,
  });
  const build = (earlier?: ReadonlySet<string>) =>
    buildSeasonSnapshot({
      vineyardId: "v1",
      vineyardName: "Abide Vineyard",
      timeZone: "America/Chicago",
      varietyCatalog: [],
      healthThresholds: { greenMin: 80, yellowMin: 70, orangeMin: 60 },
      seasonId: "s-2026",
      year: 2026,
      startedAt: new Date("2026-03-01T18:00:00.000Z"),
      closedAt,
      rows: [],
      tasks: [task("a", "dismissed"), task("b", "dismissed"), task("c", "pending")],
      harvests: [],
      previousSeasonYear: null,
      previousHarvests: [],
      activities: [],
      currentHealth: { score: 75, color: "yellow", reasons: [] },
      weather: unavailableSeasonWeather(),
      ...(earlier ? { earlierCloseDismissedTaskIds: earlier } : {}),
    });

  // First close: unchanged behavior, no new field.
  const first = build();
  assert.equal(first.tasks.dismissedBeforeClose, 2);
  assert.equal(first.tasks.dismissedByEarlierClose, undefined);

  // After reopen: "a" was dismissed by the first close, "b" by hand.
  const history = [
    { tasks: { dismissedByCloseList: [{ id: "a" }, { id: "zz" }] } },
    null,
    { tasks: {} },
  ];
  const ids = earlierCloseDismissedTaskIds(history);
  assert.deepEqual([...ids].sort(), ["a", "zz"]);
  assert.equal(earlierCloseDismissedTaskIds(undefined).size, 0);

  const second = build(ids);
  assert.equal(second.tasks.dismissedBeforeClose, 1);
  assert.equal(second.tasks.dismissedByEarlierClose, 1);
  assert.equal(second.tasks.dismissedByClose, 1);

  const summary = buildSeasonSummaryFromSnapshot(second, 2);
  assert.equal(summary.tasks.dismissedByEarlierClose, 1);
  const rendered = renderSeasonSummaryEmail(summary, "https://vineyard.example.test");
  assert.match(rendered.text, /1 dismissed earlier, 1 dismissed by an earlier close, 1 dismissed at close/);
  assert.match(rendered.html, /Dismissed by an earlier close: <strong>1<\/strong>/);

  // Without the field the wording is unchanged.
  const plain = renderSeasonSummaryEmail(
    buildSeasonSummaryFromSnapshot(first, 1),
    "https://vineyard.example.test",
  );
  assert.doesNotMatch(plain.text, /earlier close/);
});
