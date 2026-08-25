import {
  activityScopeSchema,
  activityTypeSchema,
  createActivitySchema,
} from "@vineyard/shared";
import { Prisma } from "@prisma/client";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeActivity } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { getAuthUser } from "../auth/auth.middleware.js";

export const vineyardActivitiesRouter = Router({ mergeParams: true });
export const activitiesRouter = Router();

const vineyardIdParam = z.string().uuid();
const idParam = z.string().uuid();
const rowFilter = z.string().uuid().optional();

const activityWithRow = {
  row: { select: { id: true, code: true, name: true } },
} as const;

function parsePerformedAt(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "VALIDATION_ERROR", "Enter a valid date");
  }
  return parsed;
}

async function performerNamesById(
  performedByIds: Array<string | null>,
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(performedByIds.filter((id): id is string => Boolean(id))),
  ];
  if (ids.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, displayName: true },
  });
  return new Map(users.map((user) => [user.id, user.displayName]));
}

async function requireVineyard(vineyardId: string) {
  const vineyard = await prisma.vineyard.findFirst({
    where: { id: vineyardId, deletedAt: null },
    select: { id: true },
  });
  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }
  return vineyard;
}

vineyardActivitiesRouter.get(
  "/",
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    await requireVineyard(vineyardId);

    const rowId = rowFilter.parse(req.query.rowId);
    const activityType = req.query.activityType
      ? activityTypeSchema.parse(req.query.activityType)
      : undefined;
    const scopeType = req.query.scopeType
      ? activityScopeSchema.parse(req.query.scopeType)
      : undefined;

    const activities = await prisma.activity.findMany({
      where: {
        vineyardId,
        deletedAt: null,
        ...(rowId ? { rowId } : {}),
        ...(activityType ? { activityType } : {}),
        ...(scopeType ? { scopeType } : {}),
      },
      include: activityWithRow,
      orderBy: { performedAt: "desc" },
    });

    const names = await performerNamesById(
      activities.map((activity) => activity.performedBy),
    );
    res.json({
      data: activities.map((activity) =>
        serializeActivity(
          activity,
          activity.performedBy ? (names.get(activity.performedBy) ?? null) : null,
        ),
      ),
    });
  },
);

vineyardActivitiesRouter.post(
  "/",
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    await requireVineyard(vineyardId);
    const actor = getAuthUser(req);
    const body = createActivitySchema.parse(req.body);

    if (
      body.scopeType === "block" ||
      body.scopeType === "variety" ||
      body.scopeType === "vine"
    ) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Row or whole vineyard only for now",
      );
    }

    let rowId: string | null = null;
    let scopeId = body.scopeId;

    if (body.scopeType === "vineyard") {
      if (body.scopeId !== vineyardId) {
        throw new HttpError(
          400,
          "VALIDATION_ERROR",
          "Vineyard scope must use this vineyard",
        );
      }
      rowId = null;
      scopeId = vineyardId;
    } else if (body.scopeType === "row") {
      const row = await prisma.row.findFirst({
        where: { id: body.scopeId, vineyardId, deletedAt: null },
        select: { id: true },
      });
      if (!row) {
        throw new HttpError(400, "VALIDATION_ERROR", "Row not found in this vineyard");
      }
      rowId = row.id;
      scopeId = row.id;
    }

    const activity = await prisma.activity.create({
      data: {
        vineyardId,
        rowId,
        scopeType: body.scopeType,
        scopeId,
        activityType: body.activityType,
        performedAt: parsePerformedAt(body.performedAt),
        performedBy: actor.id,
        details: (body.details ?? {}) as Prisma.InputJsonValue,
        source: body.source,
      },
      include: activityWithRow,
    });

    res.status(201).json({
      data: serializeActivity(activity, actor.displayName),
    });
  },
);

activitiesRouter.get("/:id", async (req: Request<{ id: string }>, res) => {
  const id = idParam.parse(req.params.id);
  const activity = await prisma.activity.findFirst({
    where: { id, deletedAt: null },
    include: activityWithRow,
  });
  if (!activity) {
    throw new HttpError(404, "NOT_FOUND", "Activity not found");
  }
  const names = await performerNamesById([activity.performedBy]);
  res.json({
    data: serializeActivity(
      activity,
      activity.performedBy ? (names.get(activity.performedBy) ?? null) : null,
    ),
  });
});

activitiesRouter.delete("/:id", async (req: Request<{ id: string }>, res) => {
  const id = idParam.parse(req.params.id);
  const existing = await prisma.activity.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw new HttpError(404, "NOT_FOUND", "Activity not found");
  }

  const activity = await prisma.activity.update({
    where: { id },
    data: { deletedAt: new Date() },
    include: activityWithRow,
  });

  const names = await performerNamesById([activity.performedBy]);
  res.json({
    data: serializeActivity(
      activity,
      activity.performedBy ? (names.get(activity.performedBy) ?? null) : null,
    ),
  });
});
