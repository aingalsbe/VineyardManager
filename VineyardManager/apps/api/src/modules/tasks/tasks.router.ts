import { Prisma } from "@prisma/client";
import {
  createTaskSchema,
  taskStatusSchema,
  updateTaskSchema,
} from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeTask } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";

export const tasksRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();
const taskIdParam = z.string().uuid();
const rowFilter = z.union([z.string().uuid(), z.literal("")]).optional();

const taskWithRow = {
  row: { select: { id: true, code: true, name: true } },
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

  const tasks = await prisma.task.findMany({
    where: {
      vineyardId,
      deletedAt: null,
      ...(rowId ? { rowId } : {}),
      ...(status ? { status } : {}),
    },
    include: taskWithRow,
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
  });

  res.json({ data: tasks.map(serializeTask) });
});

tasksRouter.post("/", async (req: Request<{ vineyardId: string }>, res) => {
  const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
  await requireVineyard(vineyardId);
  const body = createTaskSchema.parse(req.body);

  if (body.rowId) {
    await requireRowInVineyard(vineyardId, body.rowId);
  }

  const task = await prisma.task.create({
    data: {
      vineyardId,
      rowId: body.rowId,
      type: body.type,
      title: body.title,
      body: body.body,
      dueAt: parseDueAt(body.dueAt),
      status: body.status,
      relatedActivityType: body.relatedActivityType,
    },
    include: taskWithRow,
  });

  res.status(201).json({ data: serializeTask(task) });
});

tasksRouter.patch(
  "/:taskId",
  async (req: Request<{ vineyardId: string; taskId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const taskId = taskIdParam.parse(req.params.taskId);
    await requireVineyard(vineyardId);
    const body = updateTaskSchema.parse(req.body);

    const existing = await prisma.task.findFirst({
      where: { id: taskId, vineyardId, deletedAt: null },
    });
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Task not found");
    }

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

    const task = await prisma.task.update({
      where: { id: taskId },
      data,
      include: taskWithRow,
    });

    res.json({ data: serializeTask(task) });
  },
);
