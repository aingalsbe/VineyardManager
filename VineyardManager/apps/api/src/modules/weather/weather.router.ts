import { Router, type Request } from "express";
import { z } from "zod";
import { requireOperate, getAuthUser } from "../auth/auth.middleware.js";
import { runDailyRainCheck } from "./weather.service.js";

export const vineyardWeatherRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();

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
