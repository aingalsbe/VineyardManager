import {
  healthThresholdsSchema,
  scoreVineyardHealth,
  type HealthScoreActivityInput,
  type HealthScoreRowInput,
  type HealthScoreTaskInput,
} from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../middleware/error-handler.js";

export const vineyardHealthRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();
const asOfQuery = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() ? value.trim() : undefined));

function parseAsOf(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "VALIDATION_ERROR", "Enter a valid asOf date");
  }
  return parsed;
}

vineyardHealthRouter.get(
  "/",
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const asOf = parseAsOf(asOfQuery.parse(req.query.asOf));

    const vineyard = await prisma.vineyard.findFirst({
      where: { id: vineyardId, deletedAt: null },
    });
    if (!vineyard) {
      throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
    }

    const [rows, tasks, activities] = await Promise.all([
      prisma.row.findMany({
        where: { vineyardId, deletedAt: null },
        orderBy: [{ code: "asc" }],
      }),
      prisma.task.findMany({
        where: { vineyardId, deletedAt: null },
      }),
      prisma.activity.findMany({
        where: { vineyardId, deletedAt: null },
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

    res.json({
      data: {
        vineyardId: vineyard.id,
        asOf: asOf.toISOString(),
        overall: scored.vineyard,
        rows: scored.rows,
      },
    });
  },
);
