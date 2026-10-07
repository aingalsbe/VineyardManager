import { Router, type Request } from "express";
import { z } from "zod";
import { HttpError } from "../../middleware/error-handler.js";
import { computeVineyardHealth } from "./health.service.js";

export const vineyardHealthRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();
const asOfQuery = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() ? value.trim() : undefined));

function parseAsOf(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "VALIDATION_ERROR", "Enter a valid asOf date");
  }
  return parsed;
}

vineyardHealthRouter.get(
  "/",
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const asOf = parseAsOf(asOfQuery.parse(req.query.asOf));
    const data = await computeVineyardHealth(vineyardId, asOf);
    res.json({ data });
  },
);
