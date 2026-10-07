import {
  OPEN_TASK_STATUSES,
  addCalendarDays,
  calendarDateInZone,
} from "@vineyard/shared";
import { config } from "../../config.js";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../middleware/error-handler.js";
import { computeVineyardHealth } from "../health/health.service.js";
import { getVineyardWeather } from "../weather/weather.service.js";
import type { DigestData, DigestTask } from "./digest.types.js";

export const DIGEST_TASK_LIST_LIMIT = 10;
const UPCOMING_DAYS = 7;

/** Monday (YYYY-MM-DD) of the week containing isoDate. */
export function mondayOf(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return addCalendarDays(isoDate, -((dow + 6) % 7));
}

function firstVariety(value: string | null | undefined): string | null {
  const parts = (value ?? "")
    .split(/\s*[,;/&]\s*|\s+\+\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0]! : `${parts[0]} +${parts.length - 1}`;
}

/** Mirrors apps/web/src/lib/rowLabel.ts: removed rows → "Removed row". */
function digestRowLabel(
  row: { code: string; name: string; variety: string; deletedAt: Date | null } | null,
): { label: string | null; removed: boolean } {
  if (!row) return { label: null, removed: false };
  if (row.deletedAt || /__old_[0-9a-f]+$/i.test(row.code)) {
    return { label: "Removed row", removed: true };
  }
  const variety = firstVariety(row.variety);
  if (variety) return { label: `${row.code} ${variety}`, removed: false };
  return { label: row.name ? `${row.code} ${row.name}` : row.code, removed: false };
}

export async function buildDigestData(
  vineyardId: string,
  asOf: Date = new Date(),
): Promise<DigestData> {
  const vineyard = await prisma.vineyard.findFirst({
    where: { id: vineyardId, deletedAt: null },
    select: { id: true, name: true, timezone: true },
  });
  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }
  const timeZone = vineyard.timezone || "America/Chicago";
  const asOfDate = calendarDateInZone(asOf, timeZone);
  const upcomingEnd = addCalendarDays(asOfDate, UPCOMING_DAYS - 1);

  const openTasks = await prisma.task.findMany({
    where: {
      vineyardId,
      deletedAt: null,
      status: { in: [...OPEN_TASK_STATUSES] },
    },
    include: {
      row: { select: { code: true, name: true, variety: true, deletedAt: true } },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
  });

  const overdue: DigestTask[] = [];
  const upcoming: DigestTask[] = [];
  for (const task of openTasks) {
    const dueDate = calendarDateInZone(task.dueAt, timeZone);
    const row = digestRowLabel(task.row);
    const item: DigestTask = {
      id: task.id,
      title: task.title,
      dueDate,
      status: task.status,
      rowLabel: row.label,
      removedRow: row.removed,
    };
    if (dueDate < asOfDate) overdue.push(item);
    else if (dueDate <= upcomingEnd) upcoming.push(item);
  }

  let weather: DigestData["weather"];
  try {
    const w = await getVineyardWeather(vineyardId);
    weather = {
      available: true,
      unavailableReason: null,
      alerts: w.alerts.map((alert) => ({
        hazard: alert.hazard,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        startsAt: alert.startsAt,
      })),
      outlook: w.daily.map((day) => ({
        date: day.date,
        summary: day.summary,
        tempMaxF: day.tempMaxF,
        tempMinF: day.tempMinF,
        precipInches: day.precipInches,
        precipProbabilityPct: day.precipProbabilityPct,
      })),
    };
  } catch (error) {
    weather = {
      available: false,
      unavailableReason:
        error instanceof Error ? error.message : "Weather unavailable",
      alerts: [],
      outlook: [],
    };
  }

  const health = await computeVineyardHealth(vineyardId, asOf);

  return {
    vineyard: { id: vineyard.id, name: vineyard.name, timeZone },
    weekStart: mondayOf(asOfDate),
    asOfDate,
    generatedAt: new Date().toISOString(),
    appUrl: config.appUrl,
    tasks: {
      overdueCount: overdue.length,
      upcomingCount: upcoming.length,
      overdue: overdue.slice(0, DIGEST_TASK_LIST_LIMIT),
      upcoming: upcoming.slice(0, DIGEST_TASK_LIST_LIMIT),
      listLimit: DIGEST_TASK_LIST_LIMIT,
    },
    weather,
    health: {
      score: health.overall.score,
      color: health.overall.color,
      reasons: health.overall.reasons.slice(0, 3).map((reason) => ({
        message: reason.message,
        severity: reason.severity,
      })),
    },
  };
}
