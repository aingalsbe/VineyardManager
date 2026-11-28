import {
  activityScopeSchema,
  activityTypeSchema,
  createActivitySchema,
  listPaginationQuerySchema,
  updateActivitySchema,
} from "@vineyard/shared";
import { Prisma } from "@prisma/client";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeActivity } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { getAuthUser, requireOperate } from "../auth/auth.middleware.js";
import { withSeasonWrite } from "../seasons/season-routing.js";
import {
  assertSeasonWritable,
  resolveSeasonFilter,
} from "../seasons/seasons.service.js";

export const vineyardActivitiesRouter = Router({ mergeParams: true });
export const activitiesRouter = Router();

const vineyardIdParam = z.string().uuid();
const idParam = z.string().uuid();
const rowFilter = z.string().uuid().optional();
const deletedFilter = z.enum(["only"]).optional();

const activityWithRow = {
  row: { select: { id: true, code: true, name: true, deletedAt: true } },
  season: { select: { status: true } },
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
    const deleted = req.query.deleted
      ? deletedFilter.parse(req.query.deleted)
      : undefined;
    const seasonId = await resolveSeasonFilter(
      prisma,
      vineyardId,
      req.query.seasonId,
    );
    const { limit, offset } = listPaginationQuerySchema.parse(req.query);

    const activities = await prisma.activity.findMany({
      where: {
        vineyardId,
        deletedAt: deleted === "only" ? { not: null } : null,
        ...(rowId ? { rowId } : {}),
        ...(activityType ? { activityType } : {}),
        ...(scopeType ? { scopeType } : {}),
        ...(seasonId ? { seasonId } : {}),
      },
      include: activityWithRow,
      orderBy:
        deleted === "only" ? { deletedAt: "desc" } : { performedAt: "desc" },
      ...(limit !== undefined ? { take: limit } : {}),
      ...(offset !== undefined ? { skip: offset } : {}),
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
  requireOperate,
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

    const activity = await withSeasonWrite(vineyardId, (tx, seasonId) =>
      tx.activity.create({
        data: {
          vineyardId,
          seasonId,
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
      }),
    );

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

/**
 * Edit an activity (F1, D-06). Operate roles only.
 * Editable: activityType, performedAt, scopeType (row|vineyard), scopeId, details.
 * `source` and `performedBy` are never changed. Refuses closed-season records (B1).
 */
activitiesRouter.patch(
  "/:id",
  requireOperate,
  async (req: Request<{ id: string }>, res) => {
    const id = idParam.parse(req.params.id);
    const body = updateActivitySchema.parse(req.body);

    const activity = await prisma.$transaction(async (tx) => {
      const existing = await tx.activity.findFirst({
        where: { id, deletedAt: null },
        include: { season: { select: { status: true } } },
      });
      if (!existing) {
        throw new HttpError(404, "NOT_FOUND", "Activity not found");
      }
      await assertSeasonWritable(tx, existing);

      const data: Prisma.ActivityUpdateInput = {};
      if (body.activityType !== undefined) {
        data.activityType = body.activityType;
      }
      if (body.performedAt !== undefined) {
        data.performedAt = parsePerformedAt(body.performedAt);
      }
      if (body.details !== undefined) {
        data.details = body.details as Prisma.InputJsonValue;
      }

      if (body.scopeType !== undefined || body.scopeId !== undefined) {
        const nextScopeType = body.scopeType ?? existing.scopeType;
        if (nextScopeType === "vineyard") {
          const targetScopeId = body.scopeId ?? existing.vineyardId;
          if (targetScopeId !== existing.vineyardId) {
            throw new HttpError(
              400,
              "VALIDATION_ERROR",
              "Vineyard scope must use this vineyard",
            );
          }
          data.scopeType = "vineyard";
          data.scopeId = existing.vineyardId;
          data.row = { disconnect: true };
        } else if (nextScopeType === "row") {
          const targetRowId = body.scopeId ?? existing.rowId;
          if (!targetRowId) {
            throw new HttpError(400, "VALIDATION_ERROR", "Select a row");
          }
          const row = await tx.row.findFirst({
            where: { id: targetRowId, vineyardId: existing.vineyardId, deletedAt: null },
            select: { id: true },
          });
          if (!row) {
            throw new HttpError(
              400,
              "VALIDATION_ERROR",
              "Row not found in this vineyard",
            );
          }
          data.scopeType = "row";
          data.scopeId = row.id;
          data.row = { connect: { id: row.id } };
        } else {
          throw new HttpError(
            400,
            "VALIDATION_ERROR",
            "Row or whole vineyard only for now",
          );
        }
      }

      return tx.activity.update({
        where: { id },
        data,
        include: activityWithRow,
      });
    });

    const names = await performerNamesById([activity.performedBy]);
    res.json({
      data: serializeActivity(
        activity,
        activity.performedBy ? (names.get(activity.performedBy) ?? null) : null,
      ),
    });
  },
);

activitiesRouter.delete("/:id", requireOperate, async (req: Request<{ id: string }>, res) => {
  const id = idParam.parse(req.params.id);
  const activity = await prisma.$transaction(async (tx) => {
    const existing = await tx.activity.findFirst({
      where: { id, deletedAt: null },
      include: { season: { select: { status: true } } },
    });
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Activity not found");
    }
    await assertSeasonWritable(tx, existing);

    return tx.activity.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: activityWithRow,
    });
  });

  const names = await performerNamesById([activity.performedBy]);
  res.json({
    data: serializeActivity(
      activity,
      activity.performedBy ? (names.get(activity.performedBy) ?? null) : null,
    ),
  });
});

activitiesRouter.post(
  "/:id/restore",
  requireOperate,
  async (req: Request<{ id: string }>, res) => {
    const id = idParam.parse(req.params.id);
    const activity = await prisma.$transaction(async (tx) => {
      const existing = await tx.activity.findFirst({
        where: { id, deletedAt: { not: null } },
        include: { season: { select: { status: true } } },
      });
      if (!existing) {
        throw new HttpError(404, "NOT_FOUND", "Removed activity not found");
      }
      await assertSeasonWritable(tx, existing);

      return tx.activity.update({
        where: { id },
        data: { deletedAt: null },
        include: activityWithRow,
      });
    });

    const names = await performerNamesById([activity.performedBy]);
    res.json({
      data: serializeActivity(
        activity,
        activity.performedBy ? (names.get(activity.performedBy) ?? null) : null,
      ),
    });
  },
);
