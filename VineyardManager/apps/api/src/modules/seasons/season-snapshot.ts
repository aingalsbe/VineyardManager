import { createHash } from "node:crypto";
import {
  OPEN_TASK_STATUSES,
  addCalendarDays,
  calendarDateInZone,
  displayVariety,
  prepareHealthContext,
  scoreVineyardHealthPrepared,
  yieldToLb,
  type ActivityScope,
  type ActivityType,
  type HealthColor,
  type HealthReason,
  type HealthThresholds,
  type RowStatus,
  type SeasonDismissedTaskItem,
  type SeasonHarvestByRowSnapshot,
  type SeasonHarvestByVarietySnapshot,
  type SeasonHealthMonthlyPoint,
  type SeasonPestObservationFlag,
  type SeasonSnapshot,
  type TaskStatus,
  type YieldUnit,
} from "@vineyard/shared";
import type { OpenMeteoHistoryDay } from "../weather/open-meteo.client.js";

export type SnapshotRowInput = {
  id: string;
  code: string;
  name: string;
  variety: string;
  status: RowStatus;
  deletedAt: Date | null;
};

export type SnapshotTaskInput = {
  id: string;
  rowId: string | null;
  title: string;
  dueAt: Date;
  status: TaskStatus;
  updatedAt: Date;
  rowCode: string | null;
};

export type SnapshotHarvestInput = {
  id: string;
  rowId: string;
  yieldAmount: number;
  yieldUnit: YieldUnit;
  updatedAt: Date;
};

export type SnapshotActivityInput = {
  id: string;
  rowId: string | null;
  scopeType: ActivityScope;
  activityType: ActivityType;
  performedAt: Date;
  updatedAt: Date;
  details: Record<string, unknown> | null;
  rowCode: string | null;
};

export type SeasonWeatherSnapshot = SeasonSnapshot["weather"];

const OPEN_TASK_SET: ReadonlySet<TaskStatus> = new Set(OPEN_TASK_STATUSES);
const PEST_KEYWORDS =
  /\b(pest|beetle|mite|moth|aphid|wasp|spotted|phylloxera|leafhopper|insect|bug|mildew|rot)\b/i;

function roundLb(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic SHA-256 over the counted state of a season at preview time.
 * Any task, harvest, or activity edit/add/delete changes the token (A5).
 */
export function computeClosePreviewToken(input: {
  seasonId: string;
  openTasks: Array<{ id: string; updatedAt: Date }>;
  tasks: Array<{ id: string; updatedAt: Date }>;
  harvests: Array<{ id: string; updatedAt: Date }>;
  activities: Array<{ id: string; updatedAt: Date }>;
  untaggedOpenTaskCount: number;
}): string {
  const openSorted = input.openTasks
    .map((t) => `${t.id}:${t.updatedAt.toISOString()}`)
    .sort();
  const maxIso = (items: Array<{ updatedAt: Date }>): string => {
    let max = "";
    for (const item of items) {
      const iso = item.updatedAt.toISOString();
      if (iso > max) max = iso;
    }
    return max;
  };
  const payload = JSON.stringify({
    v: 1,
    seasonId: input.seasonId,
    openSorted,
    taskCount: input.tasks.length,
    taskMax: maxIso(input.tasks),
    harvestCount: input.harvests.length,
    harvestMax: maxIso(input.harvests),
    activityCount: input.activities.length,
    activityMax: maxIso(input.activities),
    untaggedOpenTaskCount: input.untaggedOpenTaskCount,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * D-18: Warn (never block) when closing mid-season:
 * - any open task in this season is due after today (vineyard tz), OR
 * - a fixed-calendar late-season milestone (harvest window Sep 10 or winterize Nov 10)
 *   for this season's year has not yet been reached.
 */
export function evaluateMidSeasonWarning(input: {
  seasonYear: number;
  asOfDate: string;
  openTaskDueDates: string[];
}): { midSeason: boolean; midSeasonReason: string | null } {
  const futureTasks = input.openTaskDueDates.filter((d) => d > input.asOfDate);
  const harvestMilestone = `${input.seasonYear}-09-10`;
  const winterizeMilestone = `${input.seasonYear}-11-10`;

  const reasons: string[] = [];
  if (futureTasks.length > 0) {
    reasons.push(
      `${futureTasks.length} open ${futureTasks.length === 1 ? "task is" : "tasks are"} still due later in the season`,
    );
  }
  if (input.asOfDate < harvestMilestone) {
    reasons.push(`typical harvest window (${harvestMilestone}) has not been reached yet`);
  } else if (input.asOfDate < winterizeMilestone) {
    reasons.push(`typical winterize milestone (${winterizeMilestone}) has not been reached yet`);
  }

  if (reasons.length === 0) {
    return { midSeason: false, midSeasonReason: null };
  }
  return {
    midSeason: true,
    midSeasonReason: `Closing mid-season: ${reasons.join("; ")}. New records logged after closing will go into next season.`,
  };
}

export function summarizeSeasonWeatherDays(
  days: OpenMeteoHistoryDay[],
  dateStart: string,
  dateEnd: string,
): SeasonWeatherSnapshot {
  if (days.length === 0) {
    return {
      available: false,
      unavailableReason: "Weather not available",
      frostDays: 0,
      heavyRainDays: 0,
      drySpells: 0,
      dateStart,
      dateEnd,
    };
  }
  let frostDays = 0;
  let heavyRainDays = 0;
  let drySpells = 0;
  let dryStreak = 0;

  const sorted = days.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (const day of sorted) {
    if (day.tempMinF != null && day.tempMinF <= 32) {
      frostDays += 1;
    }
    if (day.precipInches >= 1.0) {
      heavyRainDays += 1;
    }
    if (day.precipInches < 0.1) {
      dryStreak += 1;
      if (dryStreak === 14) {
        drySpells += 1;
      }
    } else {
      dryStreak = 0;
    }
  }

  return {
    available: true,
    unavailableReason: null,
    frostDays,
    heavyRainDays,
    drySpells,
    dateStart,
    dateEnd,
  };
}

export function unavailableSeasonWeather(
  reason = "Weather not available",
): SeasonWeatherSnapshot {
  return {
    available: false,
    unavailableReason: reason,
    frostDays: 0,
    heavyRainDays: 0,
    drySpells: 0,
    dateStart: null,
    dateEnd: null,
  };
}

function aggregateHarvests(
  harvests: SnapshotHarvestInput[],
  rowsById: Map<string, SnapshotRowInput>,
  catalog: string[],
): {
  totalLb: number;
  skippedNonLb: number;
  byVariety: SeasonHarvestByVarietySnapshot[];
  byRow: SeasonHarvestByRowSnapshot[];
} {
  let totalLb = 0;
  let skippedNonLb = 0;
  const varietyTotals = new Map<string, number>();
  const rowTotals = new Map<string, number>();

  for (const h of harvests) {
    const lb = yieldToLb(h.yieldAmount, h.yieldUnit);
    if (lb == null) {
      skippedNonLb += 1;
      continue;
    }
    totalLb += lb;
    rowTotals.set(h.rowId, (rowTotals.get(h.rowId) ?? 0) + lb);
    const row = rowsById.get(h.rowId);
    const variety = row ? displayVariety(row.variety, catalog) : "Unknown";
    varietyTotals.set(variety, (varietyTotals.get(variety) ?? 0) + lb);
  }

  const byVariety: SeasonHarvestByVarietySnapshot[] = [...varietyTotals.entries()]
    .map(([variety, total]) => ({ variety, totalLb: roundLb(total) }))
    .sort((a, b) => a.variety.localeCompare(b.variety));

  const byRow: SeasonHarvestByRowSnapshot[] = [...rowTotals.entries()]
    .map(([rowId, total]) => {
      const row = rowsById.get(rowId);
      return {
        rowId,
        code: row?.code ?? "Removed",
        name: row?.name ?? "Removed row",
        variety: row ? displayVariety(row.variety, catalog) : "Unknown",
        totalLb: roundLb(total),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    totalLb: roundLb(totalLb),
    skippedNonLb,
    byVariety,
    byRow,
  };
}

function hasPestPressure(details: Record<string, unknown> | null): boolean {
  if (!details) return false;
  if (Array.isArray(details.pests) && details.pests.length > 0) {
    return true;
  }
  if (typeof details.notes === "string" && PEST_KEYWORDS.test(details.notes)) {
    return true;
  }
  return false;
}

function findUnaddressedPestObservations(
  activities: SnapshotActivityInput[],
  timeZone: string,
): SeasonPestObservationFlag[] {
  const pestTreatments = activities
    .filter((a) => a.activityType === "pest_prevention")
    .map((a) => ({
      rowId: a.rowId,
      scopeType: a.scopeType,
      date: calendarDateInZone(a.performedAt, timeZone),
    }));

  const flags: SeasonPestObservationFlag[] = [];
  for (const act of activities) {
    if (act.activityType !== "health_observation") continue;
    if (!hasPestPressure(act.details)) continue;
    const obsDate = calendarDateInZone(act.performedAt, timeZone);
    const deadline = addCalendarDays(obsDate, 14);
    const treated = pestTreatments.some(
      (t) =>
        t.date >= obsDate &&
        t.date <= deadline &&
        (t.scopeType === "vineyard" || t.rowId === null || t.rowId === act.rowId),
    );
    if (!treated) {
      const notes =
        act.details && typeof act.details.notes === "string"
          ? act.details.notes.trim() || null
          : null;
      flags.push({
        activityId: act.id,
        performedDate: obsDate,
        rowId: act.rowId,
        rowCode: act.rowCode,
        notes,
      });
    }
  }
  return flags.sort((a, b) => a.performedDate.localeCompare(b.performedDate));
}

function buildMonthlyHealthTrend(input: {
  rows: SnapshotRowInput[];
  tasks: SnapshotTaskInput[];
  activities: SnapshotActivityInput[];
  healthThresholds: HealthThresholds | null;
  timeZone: string;
  seasonYear: number;
  asOfDate: string;
}): SeasonHealthMonthlyPoint[] | undefined {
  const liveRows = input.rows.filter((r) => r.deletedAt === null);
  if (liveRows.length === 0 || (input.tasks.length === 0 && input.activities.length === 0)) {
    return undefined;
  }
  const ctx = prepareHealthContext({
    rows: liveRows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      status: r.status,
    })),
    tasks: input.tasks.map((t) => ({
      id: t.id,
      rowId: t.rowId,
      title: t.title,
      dueAt: t.dueAt.toISOString(),
      status: t.status,
    })),
    activities: input.activities.map((a) => ({
      id: a.id,
      rowId: a.rowId,
      scopeType: a.scopeType,
      activityType: a.activityType,
      performedAt: a.performedAt.toISOString(),
      details: a.details,
    })),
    timeZone: input.timeZone,
  });

  const endMonth = Math.min(12, Math.max(1, Number(input.asOfDate.slice(5, 7)) || 12));
  const endYear = Number(input.asOfDate.slice(0, 4)) || input.seasonYear;
  const targetYear = Math.min(input.seasonYear, endYear);
  const points: SeasonHealthMonthlyPoint[] = [];

  for (let m = 1; m <= endMonth; m += 1) {
    const mm = String(m).padStart(2, "0");
    const lastDay = new Date(Date.UTC(targetYear, m, 0)).getUTCDate();
    const monthEnd = `${targetYear}-${mm}-${String(lastDay).padStart(2, "0")}`;
    const sampleDate = monthEnd > input.asOfDate ? input.asOfDate : monthEnd;
    const scored = scoreVineyardHealthPrepared(ctx, sampleDate, input.healthThresholds);
    points.push({
      month: `${targetYear}-${mm}`,
      score: scored.vineyard.score,
      color: scored.vineyard.color,
    });
  }
  return points.length > 0 ? points : undefined;
}

/**
 * Pure builder for the frozen SeasonSnapshot stored on Season.snapshot at close.
 */
export function buildSeasonSnapshot(input: {
  vineyardId: string;
  vineyardName: string;
  timeZone: string;
  varietyCatalog: string[];
  healthThresholds: HealthThresholds | null;
  seasonId: string;
  year: number;
  startedAt: Date | null;
  closedAt: Date;
  rows: SnapshotRowInput[];
  tasks: SnapshotTaskInput[];
  harvests: SnapshotHarvestInput[];
  previousSeasonYear: number | null;
  previousHarvests: SnapshotHarvestInput[];
  activities: SnapshotActivityInput[];
  currentHealth: { score: number; color: HealthColor; reasons: HealthReason[] };
  weather: SeasonWeatherSnapshot;
  /** Task ids dismissed by an earlier close of this season (before it was reopened). */
  earlierCloseDismissedTaskIds?: ReadonlySet<string>;
}): SeasonSnapshot {
  const asOfDate = calendarDateInZone(input.closedAt, input.timeZone);
  const rowsById = new Map(input.rows.map((r) => [r.id, r]));

  const currentHarvestAgg = aggregateHarvests(
    input.harvests,
    rowsById,
    input.varietyCatalog,
  );
  const prevHarvestAgg =
    input.previousSeasonYear !== null
      ? aggregateHarvests(input.previousHarvests, rowsById, input.varietyCatalog)
      : null;

  let waterings = 0;
  let fertilizing = 0;
  let pestTreatments = 0;
  let weedTreatments = 0;
  for (const act of input.activities) {
    if (act.activityType === "watering") waterings += 1;
    else if (act.activityType === "fertilization") fertilizing += 1;
    else if (act.activityType === "pest_prevention") pestTreatments += 1;
    else if (act.activityType === "weed_prevention") weedTreatments += 1;
  }

  let doneOnTime = 0;
  let doneLate = 0;
  let dismissedBeforeClose = 0;
  let dismissedByEarlierClose = 0;
  const dismissedByCloseList: SeasonDismissedTaskItem[] = [];

  for (const task of input.tasks) {
    const dueDate = calendarDateInZone(task.dueAt, input.timeZone);
    if (task.status === "acknowledged") {
      const doneDate = calendarDateInZone(task.updatedAt, input.timeZone);
      if (doneDate <= dueDate) doneOnTime += 1;
      else doneLate += 1;
    } else if (task.status === "dismissed") {
      if (input.earlierCloseDismissedTaskIds?.has(task.id)) {
        dismissedByEarlierClose += 1;
      } else {
        dismissedBeforeClose += 1;
      }
    } else if (OPEN_TASK_SET.has(task.status)) {
      dismissedByCloseList.push({
        id: task.id,
        title: task.title,
        dueDate,
        rowCode: task.rowCode,
      });
    }
  }
  dismissedByCloseList.sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title),
  );

  const activeRows = input.rows
    .filter((r) => r.deletedAt === null && r.status === "active")
    .map((r) => ({
      rowId: r.id,
      code: r.code,
      name: r.name,
      variety: displayVariety(r.variety, input.varietyCatalog),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const monthlyTrend = buildMonthlyHealthTrend({
    rows: input.rows,
    tasks: input.tasks,
    activities: input.activities,
    healthThresholds: input.healthThresholds,
    timeZone: input.timeZone,
    seasonYear: input.year,
    asOfDate,
  });

  return {
    schemaVersion: 1,
    vineyardId: input.vineyardId,
    vineyardName: input.vineyardName,
    timeZone: input.timeZone,
    seasonId: input.seasonId,
    year: input.year,
    startedAt: input.startedAt?.toISOString() ?? null,
    closedAt: input.closedAt.toISOString(),
    asOfDate,
    health: {
      score: input.currentHealth.score,
      color: input.currentHealth.color,
      reasons: input.currentHealth.reasons,
      ...(monthlyTrend ? { monthlyTrend } : {}),
    },
    activeRows,
    harvests: {
      unit: "lb",
      totalLb: currentHarvestAgg.totalLb,
      skippedNonLb: currentHarvestAgg.skippedNonLb,
      byVariety: currentHarvestAgg.byVariety,
      byRow: currentHarvestAgg.byRow,
      previousSeasonYear: input.previousSeasonYear,
      previousTotalLb: prevHarvestAgg ? prevHarvestAgg.totalLb : null,
      previousByVariety: prevHarvestAgg ? prevHarvestAgg.byVariety : [],
      previousByRow: prevHarvestAgg
        ? prevHarvestAgg.byRow.map((r) => ({
            rowId: r.rowId,
            code: r.code,
            totalLb: r.totalLb,
          }))
        : [],
    },
    activities: {
      waterings,
      fertilizing,
      pestTreatments,
      weedTreatments,
      pestObservationsWithoutTreatment14d: findUnaddressedPestObservations(
        input.activities,
        input.timeZone,
      ),
    },
    tasks: {
      total: input.tasks.length,
      doneOnTime,
      doneLate,
      dismissedBeforeClose,
      ...(dismissedByEarlierClose > 0 ? { dismissedByEarlierClose } : {}),
      dismissedByClose: dismissedByCloseList.length,
      dismissedByCloseList,
    },
    weather: input.weather,
  };
}
