import { Router } from "express";
import { createVineyardSchema } from "@vineyard/shared";
import { prisma } from "../../db/prisma.js";
import { serializeVineyard } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";

export const vineyardsRouter = Router();

vineyardsRouter.get("/", async (_req, res) => {
  const vineyards = await prisma.vineyard.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  res.json({ data: vineyards.map(serializeVineyard) });
});

vineyardsRouter.post("/", (req, res) => {
  const body = createVineyardSchema.parse(req.body);
  res.status(201).json({
    data: {
      id: crypto.randomUUID(),
      ownerId: "pending-auth",
      ...body,
      healthThresholds: {
        greenMin: 80,
        yellowMin: 70,
        orangeMin: 60,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
});

vineyardsRouter.get("/:id", (req, res) => {
  throw new HttpError(
    404,
    "NOT_FOUND",
    `Vineyard ${req.params.id} is not stored yet`,
  );
});
