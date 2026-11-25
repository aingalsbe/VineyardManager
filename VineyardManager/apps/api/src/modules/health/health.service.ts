import {
  OPEN_TASK_STATUSES,
  healthThresholdsSchema,
  scoreVineyardHealth,
  type HealthScoreActivityInput,
  type HealthScoreRowInput,
  type HealthScoreTaskInput,
  type VineyardHealth,
} from "@vineyard/shared";
import type { ActivityType } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../middleware/error-handler.js";

const HEALTH_ACTIVITY_TYPES: ActivityType[] = [
  "watering",
  "pest_prevention",
  "weed_prevention",
  "health_observation",
];
const ACTIVITY_LOOKBACK_DAYS = 23;

/**
 * Computed vineyard health (no persistence). Shared by GET /health and the
 * weekly digest so both report the same score and reasons.
 */
export async function computeVineyardHealth(
  vineyardId: string,
  asOf: Date,
): Promise<VineyardHealth> {
  const vineyard = await prisma.vineyard.findFirst({
    where: { id: vineyardId, deletedAt: null },
    select: { id: true, timezone: true, healthThresholds: true },
  });
  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }

  const activityWindowStart = new Date(
    asOf.getTime() - ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  const [rows, tasks, activities] = await Promise.all([
    prisma.row.findMany({
      where: { vineyardId, deletedAt: null },
      select: { id: true, code: true, name: true, status: true },
      orderBy: [{ code: "asc" }],
    }),
    prisma.task.findMany({
      where: {
        vineyardId,
        deletedAt: null,
        status: { in: [...OPEN_TASK_STATUSES] },
      },
      select: { id: true, rowId: true, title: true, dueAt: true, status: true },
    }),
    prisma.activity.findMany({
      where: {
        vineyardId,
        deletedAt: null,
        activityType: { in: HEALTH_ACTIVITY_TYPES },
        performedAt: { gte: activityWindowStart },
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
  ]);

  const thresholds = healthThresholdsSchema.safeParse(vineyard.healthThresholds);

  const scored = scoreVineyardHealth({
    rows: rows.map(
      (row): HealthScoreRowInput => ({
        id: row.id,
        code: row.code,
        name: row.name,
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
    healthThresholds: thresholds.success ? thresholds.data : null,
    asOf,
    timeZone: vineyard.timezone,
  });

  return {
    vineyardId: vineyard.id,
    asOf: asOf.toISOString(),
    overall: scored.vineyard,
    rows: scored.rows,
  };
}
