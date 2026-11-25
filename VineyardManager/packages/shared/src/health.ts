import {
  HEALTH_SCORE_DEFAULTS,
  healthColorFromScore,
} from "./constants.js";
import type {
  ActivityType,
  HealthColor,
  HealthReason,
  HealthScoreActivityInput,
  HealthScoreRowInput,
  HealthScoreTaskInput,
  HealthThresholds,
  RowHealth,
  RowStatus,
  TaskStatus,
} from "./types.js";

const FALLOW_CEILING = 69;
const REPLANTING_CEILING = 79;
const TASK_PENALTY_CAP = 40;
const OVERDUE_PENALTY = 20;
const DUE_SOON_PENALTY = 10;
const NO_WATERING_PENALTY = 15;
const NO_PEST_WEED_PENALTY = 10;
const OBSERVATION_PENALTY = 10;
const WATERING_WINDOW_DAYS = 14;
const PEST_WEED_WINDOW_DAYS = 21;
const OBSERVATION_WINDOW_DAYS = 14;
const DUE_SOON_DAYS = 7;
const DEFAULT_TIME_ZONE = "America/Chicago";

type WeightedReason = HealthReason & { weight: number };

const OPEN_TASK: ReadonlySet<TaskStatus> = new Set(["pending", "sent"]);
const FIELD_STATUSES: ReadonlySet<RowStatus> = new Set([
  "active",
  "fallow",
  "replanting",
]);

const DATE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const MAX_FORMATTER_CACHE = 64;

function getDateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = DATE_FORMATTER_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (DATE_FORMATTER_CACHE.size >= MAX_FORMATTER_CACHE) {
      DATE_FORMATTER_CACHE.clear();
    }
    DATE_FORMATTER_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

export function calendarDateInZone(date: Date, timeZone: string): string {
  const parts = getDateFormatter(timeZone).formatToParts(date);
  let year: string | undefined;
  let month: string | undefined;
  let day: string | undefined;
  for (const part of parts) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return utc.toISOString().slice(0, 10);
}

function inInclusiveWindow(
  activityDate: string,
  asOfDate: string,
  days: number,
): boolean {
  const start = addCalendarDays(asOfDate, -days);
  return activityDate >= start && activityDate <= asOfDate;
}

function isOpenTask(status: TaskStatus): boolean {
  return OPEN_TASK.has(status);
}

function isVineyardScopedActivity(activity: HealthScoreActivityInput): boolean {
  return activity.rowId == null || activity.scopeType === "vineyard";
}

function observationNotes(details: Record<string, unknown> | null | undefined): string | null {
  if (!details || typeof details.notes !== "string") return null;
  const notes = details.notes.trim();
  return notes ? notes : null;
}

function sortReasons(reasons: WeightedReason[]): HealthReason[] {
  return reasons
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(({ code, message, severity }) => ({ code, message, severity }));
}

type PreparedTask = {
  title: string;
  dueDate: string;
  removedRow: boolean;
};

type PreparedActivity = {
  activityType: ActivityType;
  performedDate: string;
  details: Record<string, unknown> | null | undefined;
};

export type PreparedHealthContext = {
  rows: HealthScoreRowInput[];
  rowStatusById: Map<string, RowStatus>;
  openTasksByRow: Map<string, PreparedTask[]>;
  vineyardOpenTasks: PreparedTask[];
  activitiesByRow: Map<string, PreparedActivity[]>;
  vineyardActivities: PreparedActivity[];
  timeZone: string;
};

/**
 * Pre-computes localized dates and groups open tasks & relevant activities by row
 * so repeated scoring (e.g. across 53 metric dates) avoids redundant DateTimeFormat
 * allocations and full-array scans.
 */
export function prepareHealthContext(input: {
  rows: HealthScoreRowInput[];
  tasks: HealthScoreTaskInput[];
  activities: HealthScoreActivityInput[];
  timeZone?: string;
}): PreparedHealthContext {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const rowStatusById = new Map<string, RowStatus>();
  for (const row of input.rows) {
    rowStatusById.set(row.id, row.status);
  }

  const openTasksByRow = new Map<string, PreparedTask[]>();
  const vineyardOpenTasks: PreparedTask[] = [];
  for (const task of input.tasks) {
    if (!isOpenTask(task.status)) continue;
    const dueDate = calendarDateInZone(new Date(task.dueAt), timeZone);
    if (task.rowId != null && rowStatusById.has(task.rowId)) {
      let list = openTasksByRow.get(task.rowId);
      if (!list) {
        list = [];
        openTasksByRow.set(task.rowId, list);
      }
      list.push({ title: task.title, dueDate, removedRow: false });
    } else {
      vineyardOpenTasks.push({
        title: task.title,
        dueDate,
        removedRow: task.rowId != null,
      });
    }
  }

  const activitiesByRow = new Map<string, PreparedActivity[]>();
  const vineyardActivities: PreparedActivity[] = [];
  for (const activity of input.activities) {
    const type = activity.activityType;
    if (
      type !== "watering" &&
      type !== "pest_prevention" &&
      type !== "weed_prevention" &&
      type !== "health_observation"
    ) {
      continue;
    }
    const prepared: PreparedActivity = {
      activityType: type,
      performedDate: calendarDateInZone(new Date(activity.performedAt), timeZone),
      details: activity.details,
    };
    if (activity.rowId != null) {
      let list = activitiesByRow.get(activity.rowId);
      if (!list) {
        list = [];
        activitiesByRow.set(activity.rowId, list);
      }
      list.push(prepared);
    }
    if (isVineyardScopedActivity(activity)) {
      vineyardActivities.push(prepared);
    }
  }

  return {
    rows: input.rows,
    rowStatusById,
    openTasksByRow,
    vineyardOpenTasks,
    activitiesByRow,
    vineyardActivities,
    timeZone,
  };
}

function scorePreparedRow(
  row: HealthScoreRowInput,
  rowTasks: PreparedTask[],
  rowActivities: PreparedActivity[],
  vineyardActivities: PreparedActivity[],
  asOfDate: string,
  soonEnd: string,
  thresholds: HealthThresholds,
): RowHealth {
  if (row.status === "retired") {
    return {
      rowId: row.id,
      code: row.code,
      name: row.name,
      score: 100,
      color: "green",
      reasons: [
        {
          code: "row_retired",
          message: "Row is retired — not scored for field work",
          severity: "green",
        },
      ],
    };
  }

  const reasons: WeightedReason[] = [];
  let score = 100;
  let taskPenalty = 0;

  for (const task of rowTasks) {
    if (task.dueDate < asOfDate) {
      if (taskPenalty < TASK_PENALTY_CAP) {
        const remaining = TASK_PENALTY_CAP - taskPenalty;
        const applied = Math.min(OVERDUE_PENALTY, remaining);
        taskPenalty += applied;
        score -= applied;
      }
      reasons.push({
        code: "task_overdue",
        message: `Overdue: ${task.title}`,
        severity: "red",
        weight: 40,
      });
    }
  }

  for (const task of rowTasks) {
    if (task.dueDate < asOfDate) continue;
    if (task.dueDate <= soonEnd) {
      if (taskPenalty < TASK_PENALTY_CAP) {
        const remaining = TASK_PENALTY_CAP - taskPenalty;
        const applied = Math.min(DUE_SOON_PENALTY, remaining);
        taskPenalty += applied;
        score -= applied;
      }
      reasons.push({
        code: "task_due_soon",
        message: `Due soon: ${task.title}`,
        severity: "yellow",
        weight: 10,
      });
    }
  }

  const wateringMatch = (activity: PreparedActivity) =>
    activity.activityType === "watering" &&
    inInclusiveWindow(activity.performedDate, asOfDate, WATERING_WINDOW_DAYS);
  const hasWatering =
    rowActivities.some(wateringMatch) || vineyardActivities.some(wateringMatch);
  if (!hasWatering) {
    score -= NO_WATERING_PENALTY;
    reasons.push({
      code: "no_watering",
      message: "No watering logged in 14 days",
      severity: "orange",
      weight: 15,
    });
  }

  const pestOrWeedMatch = (activity: PreparedActivity) => {
    const type = activity.activityType;
    if (type !== "pest_prevention" && type !== "weed_prevention") return false;
    return inInclusiveWindow(activity.performedDate, asOfDate, PEST_WEED_WINDOW_DAYS);
  };
  const hasPestOrWeed =
    rowActivities.some(pestOrWeedMatch) || vineyardActivities.some(pestOrWeedMatch);
  if (!hasPestOrWeed) {
    score -= NO_PEST_WEED_PENALTY;
    reasons.push({
      code: "no_pest_weed",
      message: "No pest/weed work in 21 days",
      severity: "yellow",
      weight: 10,
    });
  }

  const observation = rowActivities.find(
    (activity) =>
      activity.activityType === "health_observation" &&
      inInclusiveWindow(activity.performedDate, asOfDate, OBSERVATION_WINDOW_DAYS),
  );
  if (observation) {
    score -= OBSERVATION_PENALTY;
    const notes = observationNotes(observation.details);
    reasons.push({
      code: "health_observation",
      message: notes ?? "Recent health observation",
      severity: "yellow",
      weight: 10,
    });
  }

  score = Math.max(0, score);

  if (row.status === "fallow") {
    if (score > FALLOW_CEILING) score = FALLOW_CEILING;
    reasons.push({
      code: "row_fallow",
      message: "Row is fallow",
      severity: "orange",
      weight: 1,
    });
  } else if (row.status === "replanting") {
    if (score > REPLANTING_CEILING) score = REPLANTING_CEILING;
    reasons.push({
      code: "row_replanting",
      message: "Row is being replanted",
      severity: "yellow",
      weight: 1,
    });
  }

  const color = healthColorFromScore(score, thresholds);
  return {
    rowId: row.id,
    code: row.code,
    name: row.name,
    score,
    color,
    reasons: sortReasons(reasons),
  };
}

export function scoreVineyardHealthPrepared(
  ctx: PreparedHealthContext,
  asOfDate: string,
  healthThresholds?: HealthThresholds | null,
): {
  vineyard: { score: number; color: HealthColor; reasons: HealthReason[] };
  rows: RowHealth[];
} {
  const thresholds = healthThresholds ?? HEALTH_SCORE_DEFAULTS;
  const soonEnd = addCalendarDays(asOfDate, DUE_SOON_DAYS);

  const rows = ctx.rows.map((row) =>
    scorePreparedRow(
      row,
      ctx.openTasksByRow.get(row.id) ?? [],
      ctx.activitiesByRow.get(row.id) ?? [],
      ctx.vineyardActivities,
      asOfDate,
      soonEnd,
      thresholds,
    ),
  );

  const fieldRows = rows.filter((scored) => {
    const status = ctx.rowStatusById.get(scored.rowId);
    return status ? FIELD_STATUSES.has(status) : false;
  });

  const average =
    fieldRows.length === 0
      ? 100
      : fieldRows.reduce((sum, row) => sum + row.score, 0) / fieldRows.length;
  const score = Math.round(average);
  const color = healthColorFromScore(score, thresholds);

  const worstRowReasons = fieldRows
    .slice()
    .sort((a, b) => a.score - b.score || a.code.localeCompare(b.code))
    .flatMap((row) =>
      row.reasons.slice(0, 1).map((reason) => ({
        ...reason,
        message: `${row.code}: ${reason.message}`,
      })),
    )
    .slice(0, 3);

  const vineyardTaskReasons: HealthReason[] = [];
  for (const task of ctx.vineyardOpenTasks) {
    const prefix = task.removedRow ? "Removed row: " : "";
    if (task.dueDate < asOfDate) {
      vineyardTaskReasons.push({
        code: "task_overdue",
        message: `${prefix}Overdue: ${task.title}`,
        severity: "red",
      });
    } else if (task.dueDate <= soonEnd) {
      vineyardTaskReasons.push({
        code: "task_due_soon",
        message: `${prefix}Due soon: ${task.title}`,
        severity: "yellow",
      });
    }
  }

  return {
    vineyard: {
      score,
      color,
      reasons: [...worstRowReasons, ...vineyardTaskReasons],
    },
    rows,
  };
}

export function scoreRowHealth(
  row: HealthScoreRowInput,
  input: {
    tasks: HealthScoreTaskInput[];
    activities: HealthScoreActivityInput[];
    healthThresholds?: HealthThresholds | null;
    asOf: Date;
    timeZone?: string;
  },
): RowHealth {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const thresholds = input.healthThresholds ?? HEALTH_SCORE_DEFAULTS;
  const asOfDate = calendarDateInZone(input.asOf, timeZone);
  const soonEnd = addCalendarDays(asOfDate, DUE_SOON_DAYS);
  const ctx = prepareHealthContext({
    rows: [row],
    tasks: input.tasks,
    activities: input.activities,
    timeZone,
  });
  return scorePreparedRow(
    row,
    ctx.openTasksByRow.get(row.id) ?? [],
    ctx.activitiesByRow.get(row.id) ?? [],
    ctx.vineyardActivities,
    asOfDate,
    soonEnd,
    thresholds,
  );
}

export function scoreVineyardHealth(input: {
  rows: HealthScoreRowInput[];
  tasks: HealthScoreTaskInput[];
  activities: HealthScoreActivityInput[];
  healthThresholds?: HealthThresholds | null;
  asOf: Date;
  timeZone?: string;
}): {
  vineyard: { score: number; color: HealthColor; reasons: HealthReason[] };
  rows: RowHealth[];
} {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const asOfDate = calendarDateInZone(input.asOf, timeZone);
  const ctx = prepareHealthContext({
    rows: input.rows,
    tasks: input.tasks,
    activities: input.activities,
    timeZone,
  });
  return scoreVineyardHealthPrepared(ctx, asOfDate, input.healthThresholds);
}


