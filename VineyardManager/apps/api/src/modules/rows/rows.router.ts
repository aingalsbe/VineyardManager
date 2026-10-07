import { Prisma } from "@prisma/client";
import {
  ROW_DELETE_DISMISSED_TASK_STATUS,
  createRowSchema,
  deleteRowOptionsSchema,
  rowLayoutSchema,
  updateRowSchema,
  type RowDeleteOpenTasksAction,
  type RowDeletePreview,
  type RowDeleteResult,
} from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeRow } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { requireOperate } from "../auth/auth.middleware.js";
import { openTaskWhere, planRowDelete } from "./row-delete.js";

export const rowsRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();
const rowIdParam = z.string().uuid();

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

function rethrowUnique(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new HttpError(
      409,
      "CONFLICT",
      "A row with that code already exists in this vineyard",
    );
  }
  throw error;
}

rowsRouter.get("/", async (req: Request<{ vineyardId: string }>, res) => {
  const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
  await requireVineyard(vineyardId);

  const rows = await prisma.row.findMany({
    where: { vineyardId, deletedAt: null },
    orderBy: { code: "asc" },
  });

  res.json({ data: rows.map(serializeRow) });
});

rowsRouter.post("/", requireOperate, async (req: Request<{ vineyardId: string }>, res) => {
  const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
  await requireVineyard(vineyardId);
  const body = createRowSchema.parse(req.body);

  try {
    const row = await prisma.row.create({
      data: {
        vineyardId,
        code: body.code,
        name: body.name,
        variety: body.variety,
        lengthFeet: body.lengthFeet,
        lengthInches: body.lengthInches,
        vineCount: body.vineCount,
        plantedYear: body.plantedYear,
        status: body.status,
        notes: body.notes ?? null,
      },
    });
    res.status(201).json({ data: serializeRow(row) });
  } catch (error) {
    rethrowUnique(error);
  }
});

rowsRouter.patch(
  "/:rowId",
  requireOperate,
  async (req: Request<{ vineyardId: string; rowId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const rowId = rowIdParam.parse(req.params.rowId);
    await requireVineyard(vineyardId);
    const body = updateRowSchema.parse(req.body);
    const rawBody =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : null;

    const existing = await prisma.row.findFirst({
      where: { id: rowId, vineyardId, deletedAt: null },
    });
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Row not found");
    }

    try {
      const row = await prisma.row.update({
        where: { id: rowId },
        data: {
          // Partial update: undefined fields are left unchanged by Prisma.
          code: body.code,
          name: body.name,
          variety: body.variety,
          lengthFeet: body.lengthFeet,
          lengthInches: body.lengthInches,
          vineCount: body.vineCount,
          plantedYear: body.plantedYear,
          status: body.status,
          // Sending notes (even "") clears/sets it; omitting leaves it alone.
          ...(rawBody && "notes" in rawBody ? { notes: body.notes ?? null } : {}),
        },
      });
      res.json({ data: serializeRow(row) });
    } catch (error) {
      rethrowUnique(error);
    }
  },
);

/** Drop a row id from Vineyard.rowLayout so the map/editor stay clean. */
async function removeRowFromLayout(
  tx: Prisma.TransactionClient,
  vineyardId: string,
  rowId: string,
) {
  const vineyard = await tx.vineyard.findUnique({
    where: { id: vineyardId },
    select: { rowLayout: true },
  });
  const parsed = rowLayoutSchema.safeParse(vineyard?.rowLayout);
  if (!parsed.success) return;
  const rows = parsed.data.rows.filter((entry) => entry.rowId !== rowId);
  if (rows.length === parsed.data.rows.length) return;
  await tx.vineyard.update({
    where: { id: vineyardId },
    data: { rowLayout: { ...parsed.data, rows } },
  });
}

async function requireLiveRow(vineyardId: string, rowId: string) {
  const vineyard = await prisma.vineyard.findFirst({
    where: { id: vineyardId, deletedAt: null },
    select: { id: true, timezone: true },
  });
  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }
  const row = await prisma.row.findFirst({
    where: { id: rowId, vineyardId, deletedAt: null },
  });
  if (!row) {
    throw new HttpError(404, "NOT_FOUND", "Row not found");
  }
  return { row, timeZone: vineyard.timezone || "America/Chicago" };
}

/** Query (?openTasks=) and/or JSON body ({ openTasks }); conflict → 400. */
function parseDeleteOptions(req: Request): RowDeleteOpenTasksAction {
  const fromQuery = deleteRowOptionsSchema.parse({
    openTasks: req.query.openTasks,
  }).openTasks;
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const fromBody = deleteRowOptionsSchema.parse({
    openTasks: body.openTasks,
  }).openTasks;
  if (fromQuery && fromBody && fromQuery !== fromBody) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "openTasks in the query and body do not match",
    );
  }
  return fromBody ?? fromQuery ?? "keep";
}

/**
 * Preview what DELETE would do (same planRowDelete helper). Operate roles only.
 * 200 { data: RowDeletePreview } | 404 NOT_FOUND | 403 FORBIDDEN
 */
rowsRouter.get(
  "/:rowId/delete-preview",
  requireOperate,
  async (req: Request<{ vineyardId: string; rowId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const rowId = rowIdParam.parse(req.params.rowId);
    const { row, timeZone } = await requireLiveRow(vineyardId, rowId);
    const plan = await planRowDelete(prisma, row, timeZone);
    const data: RowDeletePreview = {
      rowId: row.id,
      code: row.code,
      mode: plan.mode,
      counts: plan.counts,
      openTasks: plan.openTasks,
      message: plan.message,
    };
    res.json({ data });
  },
);

/**
 * Delete a row. Operate roles only.
 * - History (any task / harvest / activity, incl. soft-deleted): SOFT delete —
 *   deletedAt set, status retired, code renamed "<code>__old_<id8>" (same as
 *   seed vacateCode). History keeps its rowId; nothing cascades or orphans.
 * - No references: HARD delete.
 * - openTasks=keep (default): open tasks stay open (shown as "Removed row").
 *   openTasks=dismiss: open (pending | sent, live) tasks → "dismissed" in the
 *   same transaction; closed tasks untouched.
 * Both paths drop the row from Vineyard.rowLayout.
 * 200 { data: RowDeleteResult } | 400 VALIDATION_ERROR | 404 NOT_FOUND | 403
 */
rowsRouter.delete(
  "/:rowId",
  requireOperate,
  async (req: Request<{ vineyardId: string; rowId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const rowId = rowIdParam.parse(req.params.rowId);
    const openTasksAction = parseDeleteOptions(req);
    const { row: existing, timeZone } = await requireLiveRow(vineyardId, rowId);

    const result = await prisma.$transaction(async (tx): Promise<RowDeleteResult> => {
      const plan = await planRowDelete(tx, existing, timeZone);

      let dismissedTaskCount = 0;
      if (openTasksAction === "dismiss" && plan.counts.openTasks > 0) {
        const updated = await tx.task.updateMany({
          where: openTaskWhere(rowId),
          data: { status: ROW_DELETE_DISMISSED_TASK_STATUS },
        });
        dismissedTaskCount = updated.count;
      }

      await removeRowFromLayout(tx, vineyardId, rowId);

      const base = {
        id: rowId,
        mode: plan.mode,
        message: plan.message,
        openTasks: openTasksAction,
        dismissedTaskCount,
        counts: plan.counts,
      };

      if (plan.mode === "hard") {
        await tx.row.delete({ where: { id: rowId } });
        return base;
      }

      const row = await tx.row.update({
        where: { id: rowId },
        data: {
          code: `${existing.code}__old_${existing.id.slice(0, 8)}`,
          status: "retired",
          deletedAt: new Date(),
        },
      });
      return { ...base, row: serializeRow(row) };
    });

    res.json({ data: result });
  },
);
