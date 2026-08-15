import { Router } from "express";
import { createVineyardSchema } from "@vineyard/shared";
import { HttpError } from "../../middleware/error-handler.js";

export const vineyardsRouter = Router();

// Persistence lands in the first CRUD slice. These handlers keep the
// /api/v1 contract and shared schemas in place until then.
vineyardsRouter.get("/", (_req, res) => {
  res.json({ data: [] });
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
