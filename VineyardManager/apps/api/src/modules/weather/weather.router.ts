import { Router, type Request } from "express";
import { weatherHistoryQuerySchema } from "@vineyard/shared";
import { z } from "zod";
import { requireOperate, getAuthUser } from "../auth/auth.middleware.js";
import {
  getVineyardWeather,
  getVineyardWeatherHistory,
  runDailyRainCheck,
} from "./weather.service.js";

export const vineyardWeatherRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();

/**
 * Current conditions + 7-day outlook + derived alerts.
 * Auth: any signed-in member (viewer+). Mounted behind requireAuth.
 * Cache TTL: 15 minutes (see weather.cache.ts / api-outline).
 */
vineyardWeatherRouter.get(
  "/",
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const data = await getVineyardWeather(vineyardId);
    res.json({ data });
  },
);

/**
 * Recent daily precip / temps / wind for calculations.
 * Auth: viewer+. Default 14 days (?days=1..90). Cache TTL: 15 minutes.
 */
vineyardWeatherRouter.get(
  "/history",
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const query = weatherHistoryQuerySchema.parse(req.query);
    const data = await getVineyardWeatherHistory(vineyardId, query.days);
    res.json({ data });
  },
);

/**
 * Manual / script trigger for the daily rain check.
 * Automated runs use the in-process cron in weather.scheduler.ts.
 * No web UI button — operate role only.
 */
vineyardWeatherRouter.post(
  "/daily-check",
  requireOperate,
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const actor = getAuthUser(req);
    const body = z
      .object({ forceRainInches: z.number().nonnegative().max(50).optional() })
      .parse(req.body ?? {});
    const result = await runDailyRainCheck(vineyardId, {
      performedBy: actor.id,
      forceRainInches: body.forceRainInches,
    });
    res.status(result.activityCreated ? 201 : 200).json({ data: result });
  },
);
