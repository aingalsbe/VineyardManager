import type {
  SeasonSnapshot,
  SeasonSummary,
  SeasonSummaryPoint,
} from "@vineyard/shared";

function pctChange(current: number, previous: number | null): number | null {
  if (previous === null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Rule-based Season Summary built strictly from the frozen SeasonSnapshot (C1, C2).
 * No AI, no external queries — every number equals the snapshot exactly.
 */
export function buildSeasonSummaryFromSnapshot(
  snapshot: SeasonSnapshot,
  closeVersion: number,
): SeasonSummary {
  const prevVarietyMap = new Map(
    snapshot.harvests.previousByVariety.map((v) => [v.variety, v.totalLb]),
  );
  const prevRowMap = new Map(
    snapshot.harvests.previousByRow.map((r) => [r.rowId, r.totalLb]),
  );

  const deltaPct = pctChange(
    snapshot.harvests.totalLb,
    snapshot.harvests.previousTotalLb,
  );

  const byVariety = snapshot.harvests.byVariety.map((v) => {
    const prev = prevVarietyMap.has(v.variety)
      ? (prevVarietyMap.get(v.variety) ?? null)
      : snapshot.harvests.previousSeasonYear !== null
        ? 0
        : null;
    return {
      variety: v.variety,
      totalLb: v.totalLb,
      previousTotalLb: prev,
      deltaPct: pctChange(v.totalLb, prev),
    };
  });

  const byRow = snapshot.harvests.byRow.map((r) => ({
    rowId: r.rowId,
    code: r.code,
    name: r.name,
    variety: r.variety,
    totalLb: r.totalLb,
    previousTotalLb: prevRowMap.has(r.rowId)
      ? (prevRowMap.get(r.rowId) ?? null)
      : snapshot.harvests.previousSeasonYear !== null
        ? 0
        : null,
  }));

  const completedTasks = snapshot.tasks.doneOnTime + snapshot.tasks.doneLate;
  const onTimePct =
    completedTasks > 0
      ? Math.round((snapshot.tasks.doneOnTime / completedTasks) * 1000) / 10
      : null;

  const positives: SeasonSummaryPoint[] = [];
  const negatives: SeasonSummaryPoint[] = [];

  // Plan §3 rule 1: Harvest up > 10% vs previous season = positive; down > 10% = negative.
  if (deltaPct !== null && snapshot.harvests.previousSeasonYear !== null) {
    if (deltaPct > 10) {
      positives.push({
        code: "harvest_up",
        text: `Harvest up ${deltaPct}% vs ${snapshot.harvests.previousSeasonYear} (${snapshot.harvests.totalLb} lb vs ${snapshot.harvests.previousTotalLb} lb).`,
      });
    } else if (deltaPct < -10) {
      negatives.push({
        code: "harvest_down",
        text: `Harvest down ${Math.abs(deltaPct)}% vs ${snapshot.harvests.previousSeasonYear} (${snapshot.harvests.totalLb} lb vs ${snapshot.harvests.previousTotalLb} lb).`,
      });
    }
  }

  // Plan §3 rule 2: >= 90% of completed tasks done on time = positive.
  if (completedTasks > 0 && snapshot.tasks.doneOnTime / completedTasks >= 0.9) {
    positives.push({
      code: "tasks_on_time",
      text: `${onTimePct}% of completed tasks were finished on time (${snapshot.tasks.doneOnTime} of ${completedTasks}).`,
    });
  }

  // Plan §3 rule 3: Active row with zero harvest = negative.
  const harvestedRowIds = new Set(
    snapshot.harvests.byRow.filter((r) => r.totalLb > 0).map((r) => r.rowId),
  );
  const zeroHarvestRows = snapshot.activeRows.filter(
    (r) => !harvestedRowIds.has(r.rowId),
  );
  if (zeroHarvestRows.length > 0) {
    const codes = zeroHarvestRows.map((r) => r.code).join(", ");
    negatives.push({
      code: "zero_harvest_row",
      text:
        zeroHarvestRows.length === 1
          ? `Active row ${codes} had no harvest recorded this season.`
          : `${zeroHarvestRows.length} active rows had no harvest recorded this season (${codes}).`,
    });
  }

  // Plan §3 rule 4: Pest observation with no pest treatment within 14 days = negative.
  const unaddressed = snapshot.activities.pestObservationsWithoutTreatment14d;
  if (unaddressed.length > 0) {
    negatives.push({
      code: "untreated_pest_observation",
      text:
        unaddressed.length === 1
          ? `1 pest observation had no pest treatment logged within 14 days (${unaddressed[0]!.performedDate}).`
          : `${unaddressed.length} pest observations had no pest treatment logged within 14 days.`,
    });
  }

  // Plan §3 rule 5: Health ending green = positive; orange or red = negative.
  if (snapshot.health.color === "green") {
    positives.push({
      code: "health_green",
      text: `Season ended with green vineyard health (score ${snapshot.health.score}).`,
    });
  } else if (
    snapshot.health.color === "orange" ||
    snapshot.health.color === "red"
  ) {
    negatives.push({
      code: "health_low",
      text: `Season ended with ${snapshot.health.color} vineyard health (score ${snapshot.health.score}).`,
    });
  }

  const weatherNote = snapshot.weather.available
    ? `${snapshot.weather.frostDays} frost ${snapshot.weather.frostDays === 1 ? "day" : "days"}, ${snapshot.weather.heavyRainDays} heavy-rain ${snapshot.weather.heavyRainDays === 1 ? "day" : "days"}, ${snapshot.weather.drySpells} dry ${snapshot.weather.drySpells === 1 ? "spell" : "spells"} (14+ dry days).`
    : (snapshot.weather.unavailableReason ?? "Weather not available");

  return {
    schemaVersion: 1,
    seasonId: snapshot.seasonId,
    year: snapshot.year,
    vineyardName: snapshot.vineyardName,
    closedAt: snapshot.closedAt,
    closeVersion,
    health: {
      score: snapshot.health.score,
      color: snapshot.health.color,
      reasons: snapshot.health.reasons,
      ...(snapshot.health.monthlyTrend
        ? { monthlyTrend: snapshot.health.monthlyTrend }
        : {}),
    },
    harvests: {
      unit: "lb",
      totalLb: snapshot.harvests.totalLb,
      skippedNonLb: snapshot.harvests.skippedNonLb,
      previousSeasonYear: snapshot.harvests.previousSeasonYear,
      previousTotalLb: snapshot.harvests.previousTotalLb,
      deltaPct,
      byVariety,
      byRow,
    },
    work: {
      waterings: snapshot.activities.waterings,
      fertilizing: snapshot.activities.fertilizing,
      pestTreatments: snapshot.activities.pestTreatments,
      weedTreatments: snapshot.activities.weedTreatments,
    },
    tasks: {
      total: snapshot.tasks.total,
      doneOnTime: snapshot.tasks.doneOnTime,
      doneLate: snapshot.tasks.doneLate,
      onTimePct,
      dismissedBeforeClose: snapshot.tasks.dismissedBeforeClose,
      dismissedByClose: snapshot.tasks.dismissedByClose,
      dismissedByCloseList: snapshot.tasks.dismissedByCloseList,
    },
    weather: {
      available: snapshot.weather.available,
      note: weatherNote,
      frostDays: snapshot.weather.frostDays,
      heavyRainDays: snapshot.weather.heavyRainDays,
      drySpells: snapshot.weather.drySpells,
    },
    positives,
    negatives,
  };
}
