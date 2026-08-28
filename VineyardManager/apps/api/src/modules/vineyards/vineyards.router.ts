import { Prisma } from "@prisma/client";
import {
  createVineyardSchema,
  HEALTH_SCORE_DEFAULTS,
  updateVineyardSchema,
} from "@vineyard/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeVineyard } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { getAuthUser } from "../auth/auth.middleware.js";
import {
  LOGO_MAX_BYTES,
  LOGO_MIME_TO_EXT,
  absoluteLogoPath,
  removeLogoFile,
  writeLogoFile,
} from "./logo.js";

export const vineyardsRouter = Router();

const idParam = z.string().uuid();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!LOGO_MIME_TO_EXT[file.mimetype]) {
      cb(
        new HttpError(
          400,
          "VALIDATION_ERROR",
          "Use a PNG, JPEG, or WebP image",
        ),
      );
      return;
    }
    cb(null, true);
  },
});

async function requireVineyard(id: string) {
  const vineyard = await prisma.vineyard.findFirst({
    where: { id, deletedAt: null },
  });
  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }
  return vineyard;
}

function handleLogoUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      next(
        new HttpError(
          400,
          "VALIDATION_ERROR",
          "Logo must be 1 MB or smaller",
        ),
      );
      return;
    }
    next(err);
  });
}

vineyardsRouter.get("/", async (_req, res) => {
  const vineyards = await prisma.vineyard.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  res.json({ data: vineyards.map(serializeVineyard) });
});

vineyardsRouter.post("/", async (req, res) => {
  const body = createVineyardSchema.parse(req.body);
  const actor = getAuthUser(req);

  const existing = await prisma.vineyard.count({
    where: { deletedAt: null },
  });
  if (existing > 0) {
    throw new HttpError(
      409,
      "CONFLICT",
      "A vineyard already exists. Edit it instead.",
    );
  }

  const vineyard = await prisma.vineyard.create({
    data: {
      ownerId: actor.id,
      name: body.name,
      address: body.address,
      timezone: body.timezone,
      lat: body.lat === undefined ? null : new Prisma.Decimal(body.lat),
      lng: body.lng === undefined ? null : new Prisma.Decimal(body.lng),
      healthThresholds: HEALTH_SCORE_DEFAULTS as Prisma.InputJsonValue,
    },
  });

  res.status(201).json({ data: serializeVineyard(vineyard) });
});

vineyardsRouter.get("/:id/logo", async (req: Request<{ id: string }>, res) => {
  const id = idParam.parse(req.params.id);
  const vineyard = await requireVineyard(id);
  if (!vineyard.logoPath || !vineyard.logoContentType) {
    throw new HttpError(404, "NOT_FOUND", "Logo not found");
  }
  res.setHeader("Content-Type", vineyard.logoContentType);
  res.setHeader("Cache-Control", "private, max-age=0");
  res.sendFile(absoluteLogoPath(vineyard.logoPath));
});

vineyardsRouter.put(
  "/:id/logo",
  handleLogoUpload,
  async (req: Request<{ id: string }>, res) => {
    const id = idParam.parse(req.params.id);
    const vineyard = await requireVineyard(id);
    const file = req.file;
    if (!file) {
      throw new HttpError(400, "VALIDATION_ERROR", "Choose a logo image");
    }

    const stored = await writeLogoFile(id, file.mimetype, file.buffer);
    if (vineyard.logoPath && vineyard.logoPath !== stored.relativePath) {
      await removeLogoFile(vineyard.logoPath);
    }

    const updated = await prisma.vineyard.update({
      where: { id },
      data: {
        logoPath: stored.relativePath,
        logoContentType: stored.contentType,
      },
    });

    res.json({ data: serializeVineyard(updated) });
  },
);

vineyardsRouter.delete("/:id/logo", async (req: Request<{ id: string }>, res) => {
  const id = idParam.parse(req.params.id);
  const vineyard = await requireVineyard(id);
  await removeLogoFile(vineyard.logoPath);
  const updated = await prisma.vineyard.update({
    where: { id },
    data: { logoPath: null, logoContentType: null },
  });
  res.json({ data: serializeVineyard(updated) });
});

vineyardsRouter.get("/:id", async (req: Request<{ id: string }>, res) => {
  const id = idParam.parse(req.params.id);
  const vineyard = await requireVineyard(id);
  res.json({ data: serializeVineyard(vineyard) });
});

vineyardsRouter.patch("/:id", async (req: Request<{ id: string }>, res) => {
  const id = idParam.parse(req.params.id);
  const body = updateVineyardSchema.parse(req.body);
  await requireVineyard(id);

  const data: Prisma.VineyardUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.address !== undefined) data.address = body.address;
  if (body.timezone !== undefined) data.timezone = body.timezone;
  if (body.lat !== undefined) {
    data.lat = body.lat === null ? null : new Prisma.Decimal(body.lat);
  }
  if (body.lng !== undefined) {
    data.lng = body.lng === null ? null : new Prisma.Decimal(body.lng);
  }
  if (body.rowLayout !== undefined) {
    data.rowLayout =
      body.rowLayout === null
        ? Prisma.JsonNull
        : (body.rowLayout as Prisma.InputJsonValue);
  }

  const vineyard = await prisma.vineyard.update({
    where: { id },
    data,
  });
  res.json({ data: serializeVineyard(vineyard) });
});
