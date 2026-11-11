import { Prisma, PrismaClient } from "@prisma/client";
import { calendarDateInZone } from "@vineyard/shared";
import { HttpError } from "../../middleware/error-handler.js";

/**
 * Pick the season for a new task, harvest, or activity.
 * The event date is not an input: the clock and the vineyard time zone are.
 * 1. active, if one exists
 * 2. else planned
 * 3. else, when the vineyard has no seasons, create active for the current local year
 * 4. else, when a closed season exists, create planned for (latest closed year + 1)
 * 5. else throw. Legacy-only data does not invent a year.
 * createMany uses skipDuplicates so a unique conflict does not abort the transaction.
 */
export async function resolveSeasonForWrite(
  tx: Prisma.TransactionClient,
  vineyardId: string,
): Promise<string> {
  const seasons = await tx.season.findMany({
    where: { vineyardId },
    select: { id: true, year: true, status: true },
  });

  const active = seasons.find((season) => season.status === "active");
  if (active) return active.id;

  const planned = seasons.find((season) => season.status === "planned");
  if (planned) return planned.id;

  if (seasons.length === 0) {
    const vineyard = await tx.vineyard.findFirst({
      where: { id: vineyardId },
      select: { timezone: true },
    });
    if (!vineyard) {
      throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
    }
    const year = localYear(new Date(), vineyard.timezone);
    await tx.season.createMany({
      data: [{ vineyardId, year, status: "active" }],
      skipDuplicates: true,
    });
    return rereadSeasonId(tx, vineyardId, year, "active");
  }

  const closedYears = seasons
    .filter((season) => season.status === "closed")
    .map((season) => season.year);
  if (closedYears.length > 0) {
    const year = Math.max(...closedYears) + 1;
    await tx.season.createMany({
      data: [{ vineyardId, year, status: "planned" }],
      skipDuplicates: true,
    });
    return rereadSeasonId(tx, vineyardId, year, "planned");
  }

  throw new HttpError(
    409,
    "SEASON_SETUP_REQUIRED",
    "Season setup is required before new records can be written",
  );
}

function localYear(now: Date, timeZone: string): number {
  let formatted: string;
  try {
    formatted = calendarDateInZone(now, timeZone);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new HttpError(
        409,
        "SEASON_SETUP_REQUIRED",
        "Season setup is required before new records can be written",
      );
    }
    throw error;
  }
  const token = formatted.split("-")[0] ?? "";
  if (!/^-?\d+$/.test(token)) {
    throw new HttpError(
      409,
      "SEASON_SETUP_REQUIRED",
      "Season setup is required before new records can be written",
    );
  }
  const year = Number(token);
  if (!Number.isSafeInteger(year)) {
    throw new HttpError(
      409,
      "SEASON_SETUP_REQUIRED",
      "Season setup is required before new records can be written",
    );
  }
  return year;
}

async function rereadSeasonId(
  tx: Prisma.TransactionClient,
  vineyardId: string,
  year: number,
  status: "active" | "planned",
): Promise<string> {
  const season = await tx.season.findFirst({
    where: { vineyardId, year, status },
    select: { id: true },
  });
  if (!season) {
    throw new HttpError(
      409,
      "SEASON_SETUP_REQUIRED",
      "Season setup is required before new records can be written",
    );
  }
  return season.id;
}

/** P2002 or a serialization failure. Anything else, including setup errors, is final. */
export function isRetryableSeasonWrite(error: unknown): boolean {
  if (error instanceof HttpError) return false;
  const seen = new Set<unknown>();
  const walk = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null || seen.has(value)) return false;
    seen.add(value);
    if (value instanceof HttpError) return false;
    const record = value as {
      code?: unknown;
      message?: unknown;
      meta?: unknown;
      cause?: unknown;
    };
    if (record.code === "P2002" || record.code === "P2034" || record.code === "40001") {
      return true;
    }
    if (typeof record.message === "string") {
      if (record.message.includes("40001") || /could not serialize access/i.test(record.message)) {
        return true;
      }
    }
    return walk(record.meta) || walk(record.cause);
  };
  return walk(error);
}

/**
 * Run resolve + write in one transaction. On P2002 or serialization failure,
 * roll back and retry the whole transaction once. Do not keep using an aborted transaction.
 */
export async function runSeasonTransaction<T>(
  client: PrismaClient,
  vineyardId: string,
  write: (tx: Prisma.TransactionClient, seasonId: string) => Promise<T>,
): Promise<T> {
  const attempt = (): Promise<T> =>
    client.$transaction(async (tx) => {
      const seasonId = await resolveSeasonForWrite(tx, vineyardId);
      return write(tx, seasonId);
    });

  try {
    return await attempt();
  } catch (error) {
    if (!isRetryableSeasonWrite(error)) throw error;
    return attempt();
  }
}

export async function withSeasonWrite<T>(
  vineyardId: string,
  write: (tx: Prisma.TransactionClient, seasonId: string) => Promise<T>,
): Promise<T> {
  const { prisma } = await import("../../db/prisma.js");
  return runSeasonTransaction(prisma, vineyardId, write);
}
