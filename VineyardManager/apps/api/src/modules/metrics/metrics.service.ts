import {
  OPEN_TASK_STATUSES,
  addCalendarDays,
  buildVineyardMetrics,
  healthThresholdsSchema,
  periodRange,
  type HealthScoreActivityInput,
  type HealthScoreTaskInput,
  type MetricsPeriod,
  type MetricsRowInput,
  type YieldUnit,
} from "@vineyard/shared";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../middleware/error-handler.js";
import { resolveSeasonFilter } from "../seasons/seasons.service.js";

const ACTIVITY_LOOKBACK_DAYS = 23;

function parseVarietyCatalog(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

export async function getVineyardMetrics(
  vineyardId: string,
  period: MetricsPeriod,
  asOf: Date,
  rawSeasonId?: string,
) {
  const vineyard = await prisma.vineyard.findFirst({
    where: { id: vineyardId, deletedAt: null },
    select: {
      id: true,
      timezone: true,
      varietyCatalog: true,
      healthThresholds: true,
    },
  });
  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }

  const seasonId = await resolveSeasonFilter(prisma, vineyardId, rawSeasonId);
  const seasonWhere = seasonId ? { seasonId } : {};

  const range = periodRange(asOf, period, vineyard.timezone);
  const activityWindowStart = new Date(
    `${addCalendarDays(range.start, -ACTIVITY_LOOKBACK_DAYS)}T00:00:00.000Z`,
  );

  const [rows, tasks, activities, harvests] = await Promise.all([
    prisma.row.findMany({
      where: { vineyardId, deletedAt: null },
      select: { id: true, code: true, name: true, variety: true, status: true },
      orderBy: [{ code: "asc" }],
    }),
    prisma.task.findMany({
      where: {
        vineyardId,
        deletedAt: null,
        status: { in: [...OPEN_TASK_STATUSES] },
        ...seasonWhere,
      },
      select: { id: true, rowId: true, title: true, dueAt: true, status: true },
    }),
    prisma.activity.findMany({
      where: {
        vineyardId,
        deletedAt: null,
        performedAt: { gte: activityWindowStart },
        ...seasonWhere,
      },
      select: {
        id: true,
        rowId: true,
        scopeType: true,
        activityType: true,
        performedAt: true,
        details: true,
      },
    }),
    prisma.harvest.findMany({
      where: { vineyardId, deletedAt: null, ...seasonWhere },
      select: {
        rowId: true,
        harvestedAt: true,
        yieldAmount: true,
        yieldUnit: true,
      },
    }),
  ]);

  const thresholds = healthThresholdsSchema.safeParse(vineyard.healthThresholds);

  return buildVineyardMetrics({
    vineyardId: vineyard.id,
    timeZone: vineyard.timezone,
    catalog: parseVarietyCatalog(vineyard.varietyCatalog),
    healthThresholds: thresholds.success ? thresholds.data : null,
    asOf,
    period,
    rows: rows.map(
      (row): MetricsRowInput => ({
        id: row.id,
        code: row.code,
        name: row.name,
        variety: row.variety,
        status: row.status,
      }),
    ),
    tasks: tasks.map(
      (task): HealthScoreTaskInput => ({
        id: task.id,
        rowId: task.rowId,
        title: task.title,
        dueAt: task.dueAt.toISOString(),
        status: task.status,
      }),
    ),
    activities: activities.map(
      (activity): HealthScoreActivityInput => ({
        id: activity.id,
        rowId: activity.rowId,
        scopeType: activity.scopeType as HealthScoreActivityInput["scopeType"],
        activityType: activity.activityType,
        performedAt: activity.performedAt.toISOString(),
        details:
          activity.details && typeof activity.details === "object"
            ? (activity.details as Record<string, unknown>)
            : {},
      }),
    ),
    harvests: harvests.map((harvest) => ({
      rowId: harvest.rowId,
      harvestedAt: harvest.harvestedAt.toISOString(),
      yieldAmount: Number(harvest.yieldAmount.toString()),
      yieldUnit: harvest.yieldUnit as YieldUnit,
    })),
  });
}
