import { Prisma } from "@prisma/client";
import {
  createHarvestSchema,
  listPaginationQuerySchema,
  updateHarvestSchema,
} from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeHarvest } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { requireOperate } from "../auth/auth.middleware.js";
import { withSeasonWrite } from "../seasons/season-routing.js";
import {
  assertSeasonWritable,
  resolveSeasonFilter,
} from "../seasons/seasons.service.js";

export const harvestsRouter = Router();

const idParam = z.string().uuid();
const rowFilter = z.string().uuid().optional();
const vineyardFilter = z.string().uuid().optional();
const deletedFilter = z.enum(["only"]).optional();

const harvestWithRow = {
  row: { select: { id: true, code: true, name: true, deletedAt: true } },
  season: { select: { status: true } },
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
  const vineyardId = vineyardFilter.parse(req.query.vineyardId);
  const deleted = req.query.deleted
    ? deletedFilter.parse(req.query.deleted)
    : undefined;
  const seasonId = await resolveSeasonFilter(
    prisma,
    vineyardId ?? null,
    req.query.seasonId,
  );
  const { limit, offset } = listPaginationQuerySchema.parse(req.query);

  const harvests = await prisma.harvest.findMany({
    where: {
      deletedAt: deleted === "only" ? { not: null } : null,
      ...(vineyardId ? { vineyardId } : {}),
      ...(rowId ? { rowId } : {}),
      ...(seasonId ? { seasonId } : {}),
    },
    include: harvestWithRow,
    orderBy:
      deleted === "only" ? { deletedAt: "desc" } : { harvestedAt: "desc" },
    ...(limit !== undefined ? { take: limit } : {}),
    ...(offset !== undefined ? { skip: offset } : {}),
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

harvestsRouter.post("/", requireOperate, async (req, res) => {
  const body = createHarvestSchema.parse(req.body);
  const row = await requireRow(body.rowId);

  const harvest = await withSeasonWrite(row.vineyardId, (tx, seasonId) =>
    tx.harvest.create({
      data: {
        rowId: row.id,
        vineyardId: row.vineyardId,
        seasonId,
        harvestedAt: parseHarvestedAt(body.harvestedAt),
        yieldAmount: new Prisma.Decimal(body.yieldAmount),
        yieldUnit: body.yieldUnit,
        notes: body.notes ?? null,
        crew: body.crew ?? null,
      },
      include: harvestWithRow,
    }),
  );

  res.status(201).json({ data: serializeHarvest(harvest) });
});

harvestsRouter.patch("/:id", requireOperate, async (req: Request<{ id: string }>, res) => {
  const id = idParam.parse(req.params.id);
  const body = updateHarvestSchema.parse(req.body);

  const harvest = await prisma.$transaction(async (tx) => {
    const existing = await tx.harvest.findFirst({
      where: { id, deletedAt: null },
      include: { season: { select: { status: true } } },
    });
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Harvest not found");
    }
    await assertSeasonWritable(tx, existing);

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
      const row = await tx.row.findFirst({
        where: { id: body.rowId, deletedAt: null },
        select: { id: true, vineyardId: true },
      });
      if (!row) {
        throw new HttpError(400, "VALIDATION_ERROR", "Row not found");
      }
      if (row.vineyardId !== existing.vineyardId) {
        throw new HttpError(
          400,
          "VALIDATION_ERROR",
          "Row not found in this vineyard",
        );
      }
      data.row = { connect: { id: row.id } };
    }

    return tx.harvest.update({
      where: { id },
      data,
      include: harvestWithRow,
    });
  });

  res.json({ data: serializeHarvest(harvest) });
});

harvestsRouter.delete("/:id", requireOperate, async (req: Request<{ id: string }>, res) => {
  const id = idParam.parse(req.params.id);
  const harvest = await prisma.$transaction(async (tx) => {
    const existing = await tx.harvest.findFirst({
      where: { id, deletedAt: null },
      include: { season: { select: { status: true } } },
    });
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Harvest not found");
    }
    await assertSeasonWritable(tx, existing);

    return tx.harvest.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: harvestWithRow,
    });
  });

  res.json({ data: serializeHarvest(harvest) });
});

harvestsRouter.post(
  "/:id/restore",
  requireOperate,
  async (req: Request<{ id: string }>, res) => {
    const id = idParam.parse(req.params.id);
    const harvest = await prisma.$transaction(async (tx) => {
      const existing = await tx.harvest.findFirst({
        where: { id, deletedAt: { not: null } },
        include: { season: { select: { status: true } } },
      });
      if (!existing) {
        throw new HttpError(404, "NOT_FOUND", "Removed harvest not found");
      }
      await assertSeasonWritable(tx, existing);

      return tx.harvest.update({
        where: { id },
        data: { deletedAt: null },
        include: harvestWithRow,
      });
    });

    res.json({ data: serializeHarvest(harvest) });
  },
);
