import { closeSeasonSchema, createNewSeasonSchema } from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { getAuthUser, requireSetup } from "../auth/auth.middleware.js";
import {
  PreviewStaleError,
  closeSeason,
  createNewSeason,
  getCloseSeasonPreview,
  getCurrentSeasonState,
  getNewSeasonPreview,
  getSeasonDetail,
  listSeasons,
  reopenSeason,
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
  "/new-preview",
  requireSetup,
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const data = await getNewSeasonPreview(vineyardId);
    res.json({ data });
  },
);

vineyardSeasonsRouter.post(
  "/new",
  requireSetup,
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const actor = getAuthUser(req);
    const body = createNewSeasonSchema.parse(req.body);
    const data = await createNewSeason(vineyardId, {
      year: body.year,
      tasks: body.tasks,
      ...(body.varietyHarvestTags
        ? { varietyHarvestTags: body.varietyHarvestTags }
        : {}),
      actorId: actor.id,
    });
    res.status(201).json({ data });
  },
);

vineyardSeasonsRouter.get(
  "/:seasonId/close-preview",
  requireSetup,
  async (req: Request<{ vineyardId: string; seasonId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const seasonId = seasonIdParam.parse(req.params.seasonId);
    const data = await getCloseSeasonPreview(vineyardId, seasonId);
    res.json({ data });
  },
);

vineyardSeasonsRouter.post(
  "/:seasonId/close",
  requireSetup,
  async (req: Request<{ vineyardId: string; seasonId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const seasonId = seasonIdParam.parse(req.params.seasonId);
    const actor = getAuthUser(req);
    const body = closeSeasonSchema.parse(req.body);
    try {
      const data = await closeSeason(vineyardId, seasonId, {
        previewToken: body.previewToken,
        actorId: actor.id,
      });
      res.json({ data });
    } catch (error) {
      if (error instanceof PreviewStaleError) {
        res.status(409).json({
          error: { code: error.code, message: error.message },
          data: error.freshPreview,
        });
        return;
      }
      throw error;
    }
  },
);

vineyardSeasonsRouter.post(
  "/:seasonId/reopen",
  requireSetup,
  async (req: Request<{ vineyardId: string; seasonId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const seasonId = seasonIdParam.parse(req.params.seasonId);
    const data = await reopenSeason(vineyardId, seasonId);
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
