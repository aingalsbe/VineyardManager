import {
  ANNUAL_CALENDAR_TEMPLATES,
  SEASON_ERROR_CODES,
  annualCalendarDueDate,
  localNoonInZone,
} from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeTask } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { requireSetup } from "../auth/auth.middleware.js";
import { withSeasonWrite } from "../seasons/season-routing.js";
import { isVineyardDormant } from "../seasons/seasons.service.js";

export const vineyardScheduleRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();

/**
 * Add missing annual calendar tasks to the vineyard's current active season (D4, G2).
 * - Refuses while dormant with 409 VINEYARD_DORMANT ("Start a new season first").
 * - Deduplicates by (seasonId, templateKey) and fallback title match INSIDE the transaction.
 * - Computes due dates from the season's year in Vineyard.timezone (never server-local clock).
 */
export async function seedMissingCalendarTasksForVineyard(
  vineyardId: string,
  now: Date = new Date(),
) {
  const vineyard = await prisma.vineyard.findFirst({
    where: { id: vineyardId, deletedAt: null },
    select: { id: true, timezone: true },
  });
  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }

  const dormant = await isVineyardDormant(prisma, vineyardId);
  if (dormant.dormant) {
    throw new HttpError(
      409,
      SEASON_ERROR_CODES.VINEYARD_DORMANT,
      "Start a new season first before adding calendar tasks.",
    );
  }

  const timeZone = vineyard.timezone || "America/Chicago";

  return withSeasonWrite(
    vineyardId,
    async (tx, seasonId) => {
      const season = await tx.season.findUnique({
        where: { id: seasonId },
        select: { id: true, year: true, status: true },
      });
      if (!season || season.status !== "active") {
        throw new HttpError(
          409,
          SEASON_ERROR_CODES.VINEYARD_DORMANT,
          "Start a new season first before adding calendar tasks.",
        );
      }

      const existing = await tx.task.findMany({
        where: { vineyardId, seasonId, deletedAt: null },
        select: { templateKey: true, title: true },
      });
      const existingKeys = new Set(
        existing
          .map((t) => t.templateKey)
          .filter((k): k is string => typeof k === "string" && k.length > 0),
      );
      const existingTitles = new Set(existing.map((t) => t.title));

      let created = 0;
      let skipped = 0;
      const createdTasks = [];

      for (const template of ANNUAL_CALENDAR_TEMPLATES) {
        if (
          existingKeys.has(template.templateKey) ||
          existingTitles.has(template.title)
        ) {
          skipped += 1;
          continue;
        }
        const dueDate = annualCalendarDueDate(
          season.year,
          template.month,
          template.day,
        );
        const task = await tx.task.create({
          data: {
            vineyardId,
            seasonId,
            rowId: null,
            type: "maintenance",
            title: template.title,
            body: template.body,
            dueAt: localNoonInZone(dueDate, timeZone),
            status: "pending",
            relatedActivityType: template.relatedActivityType,
            templateKey: template.templateKey,
          },
          include: {
            row: { select: { id: true, code: true, name: true, deletedAt: true } },
            season: { select: { status: true } },
          },
        });
        createdTasks.push(task);
        existingKeys.add(template.templateKey);
        existingTitles.add(template.title);
        created += 1;
      }

      return { created, skipped, createdTasks };
    },
    now,
  );
}

vineyardScheduleRouter.post(
  "/seed",
  requireSetup,
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const seeded = await seedMissingCalendarTasksForVineyard(vineyardId);

    res.status(seeded.created > 0 ? 201 : 200).json({
      data: {
        created: seeded.created,
        skipped: seeded.skipped,
        tasks: seeded.createdTasks.map(serializeTask),
      },
    });
  },
);
