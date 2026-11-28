import { Router, type Request } from "express";
import { z } from "zod";
import {
  getCurrentSeasonState,
  getSeasonDetail,
  listSeasons,
} from "./seasons.service.js";

export const vineyardSeasonsRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();
const seasonIdParam = z.string().uuid();

vineyardSeasonsRouter.get(
  "/",
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const data = await listSeasons(vineyardId);
    res.json({ data });
  },
);

vineyardSeasonsRouter.get(
  "/current",
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const data = await getCurrentSeasonState(vineyardId);
    res.json({ data });
  },
);

vineyardSeasonsRouter.get(
  "/:seasonId",
  async (req: Request<{ vineyardId: string; seasonId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const seasonId = seasonIdParam.parse(req.params.seasonId);
    const data = await getSeasonDetail(vineyardId, seasonId);
    res.json({ data });
  },
);
