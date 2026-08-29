import {
  ANNUAL_CALENDAR_TEMPLATES,
  annualCalendarDueDate,
} from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { serializeTask } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";

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

    let created = 0;
    let skipped = 0;
    const createdTasks = [];

    for (const template of ANNUAL_CALENDAR_TEMPLATES) {
      if (titles.has(template.title)) {
        skipped += 1;
        continue;
      }
      const task = await prisma.task.create({
        data: {
          vineyardId,
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
        include: { row: { select: { id: true, code: true, name: true } } },
      });
      createdTasks.push(task);
      titles.add(template.title);
      created += 1;
    }

    res.status(created > 0 ? 201 : 200).json({
      data: {
        created,
        skipped,
        tasks: createdTasks.map(serializeTask),
      },
    });
  },
);
