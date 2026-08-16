import { Prisma } from "@prisma/client";
import { createRowSchema, updateRowSchema } from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeRow } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";

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

rowsRouter.post("/", async (req: Request<{ vineyardId: string }>, res) => {
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
  async (req: Request<{ vineyardId: string; rowId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const rowId = rowIdParam.parse(req.params.rowId);
    await requireVineyard(vineyardId);
    const body = updateRowSchema.parse(req.body);

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
      res.json({ data: serializeRow(row) });
    } catch (error) {
      rethrowUnique(error);
    }
  },
);
