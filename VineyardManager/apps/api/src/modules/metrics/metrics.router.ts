import { metricsPeriodSchema } from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { HttpError } from "../../middleware/error-handler.js";
import { getVineyardMetrics } from "./metrics.service.js";

export const vineyardMetricsRouter = Router({ mergeParams: true });

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

vineyardMetricsRouter.get(
  "/",
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const periodParse = metricsPeriodSchema.safeParse(
      req.query.period ?? "year",
    );
    if (!periodParse.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "period must be month, quarter, or year",
      );
    }
    const asOf = parseAsOf(asOfQuery.parse(req.query.asOf));
    const data = await getVineyardMetrics(
      vineyardId,
      periodParse.data,
      asOf,
    );
    res.json({ data });
  },
);
