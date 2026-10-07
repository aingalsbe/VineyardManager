import { Prisma } from "@prisma/client";
import { createRowSchema, rowLayoutSchema, updateRowSchema } from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeRow } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { requireOperate } from "../auth/auth.middleware.js";

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

/**
 * Delete a row. Operate roles only.
 * - Any task / harvest / activity references it (including soft-deleted
 *   history): SOFT delete — deletedAt set, status retired, code renamed to
 *   "<code>__old_<id8>" (same pattern as seed vacateCode) so the code can be
 *   reused. History rows keep their rowId; nothing is cascaded or orphaned.
 * - No references at all: HARD delete.
 * Both paths remove the row from Vineyard.rowLayout.
 * 200 { data: { id, mode: "soft" | "hard", message, row? } } | 404 NOT_FOUND
 */
rowsRouter.delete(
  "/:rowId",
  requireOperate,
  async (req: Request<{ vineyardId: string; rowId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const rowId = rowIdParam.parse(req.params.rowId);
    await requireVineyard(vineyardId);

    const existing = await prisma.row.findFirst({
      where: { id: rowId, vineyardId, deletedAt: null },
    });
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Row not found");
    }

    const result = await prisma.$transaction(async (tx) => {
      const [tasks, harvests, activities] = await Promise.all([
        tx.task.count({ where: { rowId } }),
        tx.harvest.count({ where: { rowId } }),
        tx.activity.count({ where: { rowId } }),
      ]);
      const historyCount = tasks + harvests + activities;

      await removeRowFromLayout(tx, vineyardId, rowId);

      if (historyCount === 0) {
        await tx.row.delete({ where: { id: rowId } });
        return {
          id: rowId,
          mode: "hard" as const,
          message: `Row ${existing.code} deleted.`,
        };
      }

      const row = await tx.row.update({
        where: { id: rowId },
        data: {
          code: `${existing.code}__old_${existing.id.slice(0, 8)}`,
          status: "retired",
          deletedAt: new Date(),
        },
      });
      return {
        id: rowId,
        mode: "soft" as const,
        message:
          `Row ${existing.code} removed. Its history (${tasks} tasks, ${harvests} harvests, ${activities} activities) is kept and will show as "Removed row".`,
        row: serializeRow(row),
      };
    });

    res.json({ data: result });
  },
);
