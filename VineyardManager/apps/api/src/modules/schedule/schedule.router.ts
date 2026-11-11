import {
  ANNUAL_CALENDAR_TEMPLATES,
  annualCalendarDueDate,
} from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeTask } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { requireSetup } from "../auth/auth.middleware.js";
import { withSeasonWrite } from "../seasons/season-routing.js";

export const vineyardScheduleRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();

function parseDueAt(value: string): Date {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "VALIDATION_ERROR", "Enter a valid due date");
  }
  return parsed;
}

vineyardScheduleRouter.post(
  "/seed",
  requireSetup,
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const vineyard = await prisma.vineyard.findFirst({
      where: { id: vineyardId, deletedAt: null },
      select: { id: true },
    });
    if (!vineyard) {
      throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
    }

    const existing = await prisma.task.findMany({
      where: { vineyardId, deletedAt: null },
      select: { title: true },
    });
    const titles = new Set(existing.map((task) => task.title));
    const year = new Date().getFullYear();

    const seeded = await withSeasonWrite(vineyardId, async (tx, seasonId) => {
      let created = 0;
      let skipped = 0;
      const createdTasks = [];
      const seen = new Set(titles);
      for (const template of ANNUAL_CALENDAR_TEMPLATES) {
        if (seen.has(template.title)) {
          skipped += 1;
          continue;
        }
        const task = await tx.task.create({
          data: {
            vineyardId,
            seasonId,
            rowId: null,
            type: "maintenance",
            title: template.title,
            body: template.body,
            dueAt: parseDueAt(
              annualCalendarDueDate(year, template.month, template.day),
            ),
            status: "pending",
            relatedActivityType: template.relatedActivityType,
          },
          include: { row: { select: { id: true, code: true, name: true, deletedAt: true } } },
        });
        createdTasks.push(task);
        seen.add(template.title);
        created += 1;
      }
      return { created, skipped, createdTasks };
    });

    res.status(seeded.created > 0 ? 201 : 200).json({
      data: {
        created: seeded.created,
        skipped: seeded.skipped,
        tasks: seeded.createdTasks.map(serializeTask),
      },
    });
  },
);
