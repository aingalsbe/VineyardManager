import { Prisma } from "@prisma/client";
import { createHarvestSchema, updateHarvestSchema } from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeHarvest } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";

export const harvestsRouter = Router();

const idParam = z.string().uuid();
const rowFilter = z.string().uuid().optional();

const harvestWithRow = {
  row: { select: { id: true, code: true, name: true } },
} as const;

function parseHarvestedAt(value: string): Date {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "VALIDATION_ERROR", "Enter a valid harvest date");
  }
  return parsed;
}

async function requireRow(rowId: string) {
  const row = await prisma.row.findFirst({
    where: { id: rowId, deletedAt: null },
    select: { id: true, vineyardId: true },
  });
  if (!row) {
    throw new HttpError(400, "VALIDATION_ERROR", "Row not found");
  }
  return row;
}

harvestsRouter.get("/", async (req, res) => {
  const rowId = rowFilter.parse(req.query.rowId);

  const harvests = await prisma.harvest.findMany({
    where: {
      deletedAt: null,
      ...(rowId ? { rowId } : {}),
    },
    include: harvestWithRow,
    orderBy: { harvestedAt: "desc" },
  });

  res.json({ data: harvests.map(serializeHarvest) });
});

harvestsRouter.get("/:id", async (req: Request<{ id: string }>, res) => {
  const id = idParam.parse(req.params.id);
  const harvest = await prisma.harvest.findFirst({
    where: { id, deletedAt: null },
    include: harvestWithRow,
  });
  if (!harvest) {
    throw new HttpError(404, "NOT_FOUND", "Harvest not found");
  }
  res.json({ data: serializeHarvest(harvest) });
});

harvestsRouter.post("/", async (req, res) => {
  const body = createHarvestSchema.parse(req.body);
  const row = await requireRow(body.rowId);

  const harvest = await prisma.harvest.create({
    data: {
      rowId: row.id,
      vineyardId: row.vineyardId,
      harvestedAt: parseHarvestedAt(body.harvestedAt),
      yieldAmount: new Prisma.Decimal(body.yieldAmount),
      yieldUnit: body.yieldUnit,
      notes: body.notes ?? null,
      crew: body.crew ?? null,
    },
    include: harvestWithRow,
  });

  res.status(201).json({ data: serializeHarvest(harvest) });
});

harvestsRouter.patch("/:id", async (req: Request<{ id: string }>, res) => {
  const id = idParam.parse(req.params.id);
  const body = updateHarvestSchema.parse(req.body);

  const existing = await prisma.harvest.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw new HttpError(404, "NOT_FOUND", "Harvest not found");
  }

  const data: Prisma.HarvestUpdateInput = {};
  if (body.harvestedAt !== undefined) {
    data.harvestedAt = parseHarvestedAt(body.harvestedAt);
  }
  if (body.yieldAmount !== undefined) {
    data.yieldAmount = new Prisma.Decimal(body.yieldAmount);
  }
  if (body.yieldUnit !== undefined) data.yieldUnit = body.yieldUnit;
  if (body.notes !== undefined) data.notes = body.notes ?? null;
  if (body.crew !== undefined) data.crew = body.crew ?? null;
  if (body.rowId !== undefined) {
    const row = await requireRow(body.rowId);
    data.row = { connect: { id: row.id } };
    data.vineyard = { connect: { id: row.vineyardId } };
  }

  const harvest = await prisma.harvest.update({
    where: { id },
    data,
    include: harvestWithRow,
  });

  res.json({ data: serializeHarvest(harvest) });
});

harvestsRouter.delete("/:id", async (req: Request<{ id: string }>, res) => {
  const id = idParam.parse(req.params.id);
  const existing = await prisma.harvest.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw new HttpError(404, "NOT_FOUND", "Harvest not found");
  }

  const harvest = await prisma.harvest.update({
    where: { id },
    data: { deletedAt: new Date() },
    include: harvestWithRow,
  });

  res.json({ data: serializeHarvest(harvest) });
});
