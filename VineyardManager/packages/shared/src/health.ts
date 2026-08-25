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

export function calendarDateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

function addCalendarDays(isoDate: string, days: number): string {
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

function appliesToRow(
  activity: HealthScoreActivityInput,
  row: HealthScoreRowInput,
): boolean {
  if (activity.rowId === row.id) return true;
  if (row.status === "retired") return false;
  return isVineyardScopedActivity(activity);
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

  const rowTasks = input.tasks.filter(
    (task) => task.rowId === row.id && isOpenTask(task.status),
  );

  for (const task of rowTasks) {
    const dueDate = calendarDateInZone(new Date(task.dueAt), timeZone);
    if (dueDate < asOfDate) {
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
    const dueDate = calendarDateInZone(new Date(task.dueAt), timeZone);
    if (dueDate < asOfDate) continue;
    const soonEnd = addCalendarDays(asOfDate, DUE_SOON_DAYS);
    if (dueDate <= soonEnd) {
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

  const rowActivities = input.activities.filter((activity) =>
    appliesToRow(activity, row),
  );

  const hasWatering = rowActivities.some(
    (activity) =>
      activity.activityType === "watering" &&
      inInclusiveWindow(
        calendarDateInZone(new Date(activity.performedAt), timeZone),
        asOfDate,
        WATERING_WINDOW_DAYS,
      ),
  );
  if (!hasWatering) {
    score -= NO_WATERING_PENALTY;
    reasons.push({
      code: "no_watering",
      message: "No watering logged in 14 days",
      severity: "orange",
      weight: 15,
    });
  }

  const hasPestOrWeed = rowActivities.some((activity) => {
    const type: ActivityType = activity.activityType;
    if (type !== "pest_prevention" && type !== "weed_prevention") return false;
    return inInclusiveWindow(
      calendarDateInZone(new Date(activity.performedAt), timeZone),
      asOfDate,
      PEST_WEED_WINDOW_DAYS,
    );
  });
  if (!hasPestOrWeed) {
    score -= NO_PEST_WEED_PENALTY;
    reasons.push({
      code: "no_pest_weed",
      message: "No pest/weed work in 21 days",
      severity: "yellow",
      weight: 10,
    });
  }

  const observation = input.activities.find((activity) => {
    if (activity.activityType !== "health_observation") return false;
    if (activity.rowId !== row.id) return false;
    return inInclusiveWindow(
      calendarDateInZone(new Date(activity.performedAt), timeZone),
      asOfDate,
      OBSERVATION_WINDOW_DAYS,
    );
  });
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
  const thresholds = input.healthThresholds ?? HEALTH_SCORE_DEFAULTS;
  const asOfDate = calendarDateInZone(input.asOf, timeZone);

  const rows = input.rows.map((row) =>
    scoreRowHealth(row, {
      tasks: input.tasks,
      activities: input.activities,
      healthThresholds: thresholds,
      asOf: input.asOf,
      timeZone,
    }),
  );

  const fieldRows = rows.filter((scored) => {
    const source = input.rows.find((row) => row.id === scored.rowId);
    return source ? FIELD_STATUSES.has(source.status) : false;
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
  for (const task of input.tasks) {
    if (task.rowId != null || !isOpenTask(task.status)) continue;
    const dueDate = calendarDateInZone(new Date(task.dueAt), timeZone);
    if (dueDate < asOfDate) {
      vineyardTaskReasons.push({
        code: "task_overdue",
        message: `Overdue: ${task.title}`,
        severity: "red",
      });
    } else if (dueDate <= addCalendarDays(asOfDate, DUE_SOON_DAYS)) {
      vineyardTaskReasons.push({
        code: "task_due_soon",
        message: `Due soon: ${task.title}`,
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

