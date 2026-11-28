import assert from "node:assert/strict";
import test from "node:test";
import { suggestVarietyHarvestTiming } from "@vineyard/shared";
import {
  buildLocationBasedSeasonCalendar,
  buildVarietySuggestions,
  clearClimateHistoryCache,
  computeClimateMilestones,
  fetchTenYearClimateHistory,
} from "../src/modules/seasons/season-calendar.js";
import type { OpenMeteoHistoryDay } from "../src/modules/weather/open-meteo.client.js";

/**
 * Deterministic multi-year daily temperature profile generator modeling realistic
 * sinusoidal seasonal curves for two distinct US grape-growing climates:
 * - Central Missouri (warmer, earlier spring, higher GDD)
 * - Northern Michigan (cooler, later spring frost, later GDD accumulation)
 */
function buildClimateFixture(profile: {
  startYear: number;
  years: number;
  meanTempF: number;
  amplitudeF: number;
  diurnalSpreadF: number;
  peakDoy: number;
}): OpenMeteoHistoryDay[] {
  const days: OpenMeteoHistoryDay[] = [];
  for (let y = profile.startYear; y < profile.startYear + profile.years; y += 1) {
    for (let doy = 1; doy <= 365; doy += 1) {
      const ms = Date.UTC(y, 0, 1) + (doy - 1) * 24 * 60 * 60 * 1000;
      const d = new Date(ms);
      const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const angle = (2 * Math.PI * (doy - profile.peakDoy)) / 365;
      const avgF = profile.meanTempF + profile.amplitudeF * Math.cos(angle);
      const tempMaxF = Math.round((avgF + profile.diurnalSpreadF / 2) * 10) / 10;
      const tempMinF = Math.round((avgF - profile.diurnalSpreadF / 2) * 10) / 10;
      days.push({
        date,
        precipInches: 0.1,
        tempMaxF,
        tempMinF,
        windMphMax: 8,
      });
    }
  }
  return days;
}

const MISSOURI_FIXTURE = buildClimateFixture({
  startYear: 2016,
  years: 10,
  meanTempF: 55.5,
  amplitudeF: 24.5,
  diurnalSpreadF: 20,
  peakDoy: 200,
});

const MICHIGAN_FIXTURE = buildClimateFixture({
  startYear: 2016,
  years: 10,
  meanTempF: 47.0,
  amplitudeF: 24.5,
  diurnalSpreadF: 18,
  peakDoy: 204,
});

test("E1/E5: two locations (Missouri vs Michigan) produce deterministic, climatically ordered dates", () => {
  const mo = computeClimateMilestones(MISSOURI_FIXTURE, 2027);
  const mi = computeClimateMilestones(MICHIGAN_FIXTURE, 2027);
  assert.ok(mo);
  assert.ok(mi);
  assert.equal(mo.yearsAnalyzed, 10);
  assert.equal(mi.yearsAnalyzed, 10);

  // Warmer Central Missouri reaches bud break, bloom, veraison, and harvest earlier than Northern Michigan
  assert.ok(mo.budBreakDoy < mi.budBreakDoy, "MO bud break must precede MI");
  assert.ok(mo.bloomDoy < mi.bloomDoy, "MO bloom must precede MI");
  assert.ok(mo.veraisonDoy < mi.veraisonDoy, "MO veraison must precede MI");
  assert.ok(mo.harvestEarlyDoy < mi.harvestEarlyDoy, "MO harvest must precede MI");
  assert.ok(
    (mo.lastSpringFrostDoy ?? 0) < (mi.lastSpringFrostDoy ?? 999),
    "MO last spring frost must precede MI",
  );
  assert.ok(
    (mo.firstFallFrostDoy ?? 0) > (mi.firstFallFrostDoy ?? 0),
    "MO first fall frost must come later than MI",
  );

  // Exact deterministic snapshot check (±0 days tolerance on both fixtures)
  assert.equal(mo.summary.avgLastSpringFrost, "2027-03-15");
  assert.equal(mo.summary.estimatedBudBreak, "2027-05-07");
  assert.equal(mo.summary.estimatedBloom, "2027-06-01");
  assert.equal(mo.summary.estimatedVeraison, "2027-07-11");
  assert.equal(mo.summary.avgFirstFallFrost, "2027-11-22");

  assert.equal(mi.summary.avgLastSpringFrost, "2027-04-08");
  assert.equal(mi.summary.estimatedBudBreak, "2027-06-01");
  assert.equal(mi.summary.estimatedBloom, "2027-06-26");
  assert.equal(mi.summary.estimatedVeraison, "2027-08-19");
  assert.equal(mi.summary.avgFirstFallFrost, "2027-11-06");
});

test("E2/E4/D-10/D-11/D-12: calendar has Dormant Pruning first, citations on every item, Estimate badges, and later variety tag pushes harvest later", () => {
  const cal = buildLocationBasedSeasonCalendar({
    targetYear: 2027,
    historyDays: MISSOURI_FIXTURE,
    varieties: ["Chardonnay", "Chardonel", "Norton"],
    confirmedTags: {
      Chardonnay: "early",
      Chardonel: "mid",
      Norton: "late",
    },
  });
  assert.ok(cal);

  // Dormant pruning first and labeled Estimate
  assert.equal(cal.tasks[0]?.templateKey, "dormant_prune");
  assert.equal(cal.tasks[0]?.stage, "dormant");
  assert.equal(cal.tasks[0]?.isEstimate, true);

  // Every task carries a non-empty source string
  for (const task of cal.tasks) {
    assert.ok(task.source.trim().length > 0, `task ${task.templateKey} must have source`);
  }

  // Spring fertilizing mentions soil test (D-12)
  const feed = cal.tasks.find((t) => t.templateKey === "spring_feed");
  assert.ok(feed);
  assert.match(feed.body, /soil test/i);

  // Pest scouting every 2 weeks bloom -> veraison says "treat if pressure is up" (D-11)
  const scouts = cal.tasks.filter((t) => t.templateKey.startsWith("pest_scouting_"));
  assert.ok(scouts.length >= 2);
  for (const scout of scouts) {
    assert.match(scout.body, /treat if pressure is up/i);
  }

  // Harvest tasks say "Start checking sugar levels", labeled Estimate, ordered early < mid < late
  const hChardonnay = cal.tasks.find((t) => t.variety === "Chardonnay");
  const hChardonel = cal.tasks.find((t) => t.variety === "Chardonel");
  const hNorton = cal.tasks.find((t) => t.variety === "Norton");
  assert.ok(hChardonnay && hChardonel && hNorton);
  for (const h of [hChardonnay, hChardonel, hNorton]) {
    assert.match(h.body, /start checking sugar levels/i);
    assert.equal(h.isEstimate, true);
  }
  assert.ok(
    hChardonnay.dueDate < hChardonel.dueDate,
    `early (${hChardonnay.dueDate}) must precede mid (${hChardonel.dueDate})`,
  );
  assert.ok(
    hChardonel.dueDate < hNorton.dueDate,
    `mid (${hChardonel.dueDate}) must precede late (${hNorton.dueDate})`,
  );
});

test("E4: variety suggestions work for well-known grapes, null for unknown, and are NEVER auto-applied", () => {
  assert.equal(suggestVarietyHarvestTiming("Chardonnay")?.timing, "early");
  assert.equal(suggestVarietyHarvestTiming("Pinot Noir")?.timing, "early");
  assert.equal(suggestVarietyHarvestTiming("Seyval")?.timing, "mid");
  assert.equal(suggestVarietyHarvestTiming("Marquette")?.timing, "late");
  assert.equal(suggestVarietyHarvestTiming("Norton")?.timing, "late");
  assert.equal(suggestVarietyHarvestTiming("Mystery Backyard Grape"), null);

  // Build suggestions with NO confirmed tags -> currentTag stays null even when suggestedTag is present
  const suggestions = buildVarietySuggestions(
    ["Chardonnay", "Norton", "Mystery Backyard Grape"],
    {},
  );
  assert.equal(suggestions[0]?.suggestedTag, "early");
  assert.equal(suggestions[0]?.currentTag, null);
  assert.equal(suggestions[1]?.suggestedTag, "late");
  assert.equal(suggestions[1]?.currentTag, null);
  assert.equal(suggestions[2]?.suggestedTag, null);
  assert.equal(suggestions[2]?.currentTag, null);

  // Unconfirmed varieties in calendar must NOT auto-apply early/late suggestions (both default to mid)
  const unconfirmedCal = buildLocationBasedSeasonCalendar({
    targetYear: 2027,
    historyDays: MISSOURI_FIXTURE,
    varieties: ["Chardonnay", "Norton"],
    confirmedTags: {},
  });
  assert.ok(unconfirmedCal);
  const cDate = unconfirmedCal.tasks.find((t) => t.variety === "Chardonnay")?.dueDate;
  const nDate = unconfirmedCal.tasks.find((t) => t.variety === "Norton")?.dueDate;
  assert.equal(cDate, nDate, "unconfirmed varieties must not auto-apply suggested early/late tags");
});

test("E3/E5: fetchTenYearClimateHistory caches results and fails closed / returns null on timeout or error", async () => {
  clearClimateHistoryCache();
  let calls = 0;

  // Fail-closed mock rejecting network
  const failed = await fetchTenYearClimateHistory(
    { lat: 38.95, lng: -92.33, address: "Columbia, MO", timezone: "America/Chicago" },
    {
      endYear: 2025,
      fetchArchive: async () => {
        calls += 1;
        throw new Error("ETIMEDOUT");
      },
    },
  );
  assert.equal(failed, null);
  assert.equal(calls, 1);

  // Successful mock is cached for repeat call
  const ok1 = await fetchTenYearClimateHistory(
    { lat: 38.95, lng: -92.33, address: "Columbia, MO", timezone: "America/Chicago" },
    {
      endYear: 2025,
      fetchArchive: async () => {
        calls += 1;
        return MISSOURI_FIXTURE;
      },
    },
  );
  assert.ok(ok1 && ok1.length === MISSOURI_FIXTURE.length);
  assert.equal(calls, 2);

  const ok2 = await fetchTenYearClimateHistory(
    { lat: 38.95, lng: -92.33, address: "Columbia, MO", timezone: "America/Chicago" },
    {
      endYear: 2025,
      fetchArchive: async () => {
        calls += 1;
        throw new Error("should have hit cache");
      },
    },
  );
  assert.ok(ok2 && ok2.length === MISSOURI_FIXTURE.length);
  assert.equal(calls, 2);
});
