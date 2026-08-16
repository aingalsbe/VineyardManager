import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeBlock } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";

export const blocksRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();

blocksRouter.get("/", async (req: Request<{ vineyardId: string }>, res) => {
  const vineyardId = vineyardIdParam.parse(req.params.vineyardId);

  const vineyard = await prisma.vineyard.findFirst({
    where: { id: vineyardId, deletedAt: null },
    select: { id: true },
  });

  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }

  const blocks = await prisma.block.findMany({
    where: { vineyardId, deletedAt: null },
    orderBy: { code: "asc" },
  });

  res.json({ data: blocks.map(serializeBlock) });
});
