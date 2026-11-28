import { Prisma } from "@prisma/client";
import {
  createTaskSchema,
  listPaginationQuerySchema,
  taskStatusSchema,
  updateTaskSchema,
} from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeTask } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { requireOperate } from "../auth/auth.middleware.js";
import { withSeasonWrite } from "../seasons/season-routing.js";
import {
  assertSeasonWritable,
  resolveSeasonFilter,
} from "../seasons/seasons.service.js";

export const tasksRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();
const taskIdParam = z.string().uuid();
const rowFilter = z.union([z.string().uuid(), z.literal("")]).optional();
const deletedFilter = z.enum(["only"]).optional();

const taskWithRow = {
  row: { select: { id: true, code: true, name: true, deletedAt: true } },
  season: { select: { status: true } },
} as const;

function parseDueAt(value: string): Date {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "VALIDATION_ERROR", "Enter a valid due date");
  }
  return parsed;
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

async function requireRowInVineyard(vineyardId: string, rowId: string) {
  const row = await prisma.row.findFirst({
    where: { id: rowId, vineyardId, deletedAt: null },
    select: { id: true },
  });
  if (!row) {
    throw new HttpError(400, "VALIDATION_ERROR", "Row not found in this vineyard");
  }
  return row;
}

tasksRouter.get("/", async (req: Request<{ vineyardId: string }>, res) => {
  const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
  await requireVineyard(vineyardId);

  const rowId = rowFilter.parse(req.query.rowId);
  const status = req.query.status
    ? taskStatusSchema.parse(req.query.status)
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

  const tasks = await prisma.task.findMany({
    where: {
      vineyardId,
      deletedAt: deleted === "only" ? { not: null } : null,
      ...(rowId ? { rowId } : {}),
      ...(status ? { status } : {}),
      ...(seasonId ? { seasonId } : {}),
    },
    include: taskWithRow,
    orderBy:
      deleted === "only"
        ? [{ deletedAt: "desc" }]
        : [{ dueAt: "asc" }, { createdAt: "asc" }],
    ...(limit !== undefined ? { take: limit } : {}),
    ...(offset !== undefined ? { skip: offset } : {}),
  });

  res.json({ data: tasks.map(serializeTask) });
});

tasksRouter.post("/", requireOperate, async (req: Request<{ vineyardId: string }>, res) => {
  const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
  await requireVineyard(vineyardId);
  const body = createTaskSchema.parse(req.body);

  if (body.rowId) {
    await requireRowInVineyard(vineyardId, body.rowId);
  }

  const task = await withSeasonWrite(vineyardId, (tx, seasonId) =>
    tx.task.create({
      data: {
        vineyardId,
        seasonId,
        rowId: body.rowId,
        type: body.type,
        title: body.title,
        body: body.body,
        dueAt: parseDueAt(body.dueAt),
        status: body.status,
        relatedActivityType: body.relatedActivityType,
      },
      include: taskWithRow,
    }),
  );

  res.status(201).json({ data: serializeTask(task) });
});

tasksRouter.patch(
  "/:taskId",
  requireOperate,
  async (req: Request<{ vineyardId: string; taskId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const taskId = taskIdParam.parse(req.params.taskId);
    await requireVineyard(vineyardId);
    const body = updateTaskSchema.parse(req.body);

    if (body.rowId) {
      await requireRowInVineyard(vineyardId, body.rowId);
    }

    const data: Prisma.TaskUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.body !== undefined) data.body = body.body;
    if (body.type !== undefined) data.type = body.type;
    if (body.status !== undefined) data.status = body.status;
    if (body.relatedActivityType !== undefined) {
      data.relatedActivityType = body.relatedActivityType;
    }
    if (body.dueAt !== undefined) data.dueAt = parseDueAt(body.dueAt);
    if (body.rowId !== undefined) {
      data.row = body.rowId
        ? { connect: { id: body.rowId } }
        : { disconnect: true };
    }

    const task = await prisma.$transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id: taskId, vineyardId, deletedAt: null },
        include: { season: { select: { status: true } } },
      });
      if (!existing) {
        throw new HttpError(404, "NOT_FOUND", "Task not found");
      }
      await assertSeasonWritable(tx, existing);
      return tx.task.update({
        where: { id: taskId },
        data,
        include: taskWithRow,
      });
    });

    res.json({ data: serializeTask(task) });
  },
);

/**
 * Soft-delete a task (sets deletedAt; hidden from lists). Operate roles only.
 * 200 { data: task } | 404 NOT_FOUND | 403 FORBIDDEN (viewer) | 409 SEASON_LOCKED
 */
tasksRouter.delete(
  "/:taskId",
  requireOperate,
  async (req: Request<{ vineyardId: string; taskId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const taskId = taskIdParam.parse(req.params.taskId);
    await requireVineyard(vineyardId);

    const task = await prisma.$transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id: taskId, vineyardId, deletedAt: null },
        include: { season: { select: { status: true } } },
      });
      if (!existing) {
        throw new HttpError(404, "NOT_FOUND", "Task not found");
      }
      await assertSeasonWritable(tx, existing);
      return tx.task.update({
        where: { id: taskId },
        data: { deletedAt: new Date() },
        include: taskWithRow,
      });
    });
    res.json({ data: serializeTask(task) });
  },
);

tasksRouter.post(
  "/:taskId/restore",
  requireOperate,
  async (req: Request<{ vineyardId: string; taskId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const taskId = taskIdParam.parse(req.params.taskId);
    await requireVineyard(vineyardId);

    const task = await prisma.$transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id: taskId, vineyardId, deletedAt: { not: null } },
        include: { season: { select: { status: true } } },
      });
      if (!existing) {
        throw new HttpError(404, "NOT_FOUND", "Removed task not found");
      }
      await assertSeasonWritable(tx, existing);

      // Avoid templateKey conflict if another live task took that key while deleted.
      let clearTemplateKey = false;
      if (existing.templateKey && existing.seasonId) {
        const dup = await tx.task.findFirst({
          where: {
            seasonId: existing.seasonId,
            templateKey: existing.templateKey,
            deletedAt: null,
            id: { not: taskId },
          },
          select: { id: true },
        });
        clearTemplateKey = Boolean(dup);
      }

      return tx.task.update({
        where: { id: taskId },
        data: {
          deletedAt: null,
          ...(clearTemplateKey ? { templateKey: null } : {}),
        },
        include: taskWithRow,
      });
    });

    res.json({ data: serializeTask(task) });
  },
);
