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
import { isVineyardDormant } from "../seasons/seasons.service.js";

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
 *
 * While dormant (A8, D-20): returns a neutral dormant state with no overdue
 * penalties until a New Season starts. While active: ignores closed-season records.
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

  const dormantState = await isVineyardDormant(prisma, vineyardId);
  if (dormantState.dormant) {
    const rows = await prisma.row.findMany({
      where: { vineyardId, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: [{ code: "asc" }],
    });
    return {
      vineyardId: vineyard.id,
      asOf: asOf.toISOString(),
      dormant: true,
      dormantSince: dormantState.dormantSince,
      overall: {
        score: 100,
        color: "green",
        reasons: [
          {
            code: "vineyard_dormant",
            message: "Vineyard is dormant until a new season starts.",
            severity: "green",
          },
        ],
      },
      rows: rows.map((row) => ({
        rowId: row.id,
        code: row.code,
        name: row.name,
        score: 100,
        color: "green",
        reasons: [
          {
            code: "vineyard_dormant",
            message: "Dormant",
            severity: "green",
          },
        ],
      })),
    };
  }

  const activityWindowStart = new Date(
    asOf.getTime() - ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  const notClosedSeason = {
    OR: [{ seasonId: null }, { season: { status: { not: "closed" as const } } }],
  };

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
        ...notClosedSeason,
      },
      select: { id: true, rowId: true, title: true, dueAt: true, status: true },
    }),
    prisma.activity.findMany({
      where: {
        vineyardId,
        deletedAt: null,
        activityType: { in: HEALTH_ACTIVITY_TYPES },
        performedAt: { gte: activityWindowStart },
        ...notClosedSeason,
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
    dormant: false,
    dormantSince: null,
    overall: scored.vineyard,
    rows: scored.rows,
  };
}
