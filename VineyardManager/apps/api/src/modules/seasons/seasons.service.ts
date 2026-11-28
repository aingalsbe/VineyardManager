import type { Prisma, PrismaClient, Season } from "@prisma/client";
import {
  SEASON_ERROR_CODES,
  SEASON_LOCKED_MESSAGE,
  type CurrentSeasonState,
  type SeasonDto,
  type SeasonStatus,
} from "@vineyard/shared";
import { prisma } from "../../db/prisma.js";
import { serializeSeason } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Derive active/dormant state from a vineyard's season rows.
 * Dormant = at least one closed season AND no active season (A3; no extra vineyard column).
 */
export function deriveDormantState(seasons: Season[]): CurrentSeasonState {
  const active = seasons.find((s) => s.status === "active") ?? null;
  const planned = seasons.find((s) => s.status === "planned") ?? null;
  const closed = seasons
    .filter((s) => s.status === "closed")
    .sort((a, b) => {
      const aTime = a.closedAt?.getTime() ?? 0;
      const bTime = b.closedAt?.getTime() ?? 0;
      return bTime - aTime || b.year - a.year;
    });
  const lastClosed = closed[0] ?? null;

  if (!active && lastClosed) {
    return {
      dormant: true,
      dormantSince: lastClosed.closedAt?.toISOString() ?? null,
      season: null,
      lastClosedSeason: serializeSeason(lastClosed),
      plannedSeason: planned ? serializeSeason(planned) : null,
    };
  }

  return {
    dormant: false,
    dormantSince: null,
    season: active ? serializeSeason(active) : null,
    lastClosedSeason: lastClosed ? serializeSeason(lastClosed) : null,
    plannedSeason: planned ? serializeSeason(planned) : null,
  };
}

/**
 * True when the vineyard is dormant (has at least one closed season and no active season).
 */
export async function isVineyardDormant(
  db: DbClient,
  vineyardId: string,
): Promise<{ dormant: boolean; dormantSince: string | null }> {
  const seasons = await db.season.findMany({
    where: { vineyardId, status: { in: ["active", "closed"] } },
    select: { status: true, closedAt: true, year: true },
  });
  const hasActive = seasons.some((s) => s.status === "active");
  if (hasActive) return { dormant: false, dormantSince: null };
  const closed = seasons
    .filter((s) => s.status === "closed")
    .sort((a, b) => {
      const aTime = a.closedAt?.getTime() ?? 0;
      const bTime = b.closedAt?.getTime() ?? 0;
      return bTime - aTime || b.year - a.year;
    });
  const latest = closed[0];
  if (!latest) return { dormant: false, dormantSince: null };
  return {
    dormant: true,
    dormantSince: latest.closedAt?.toISOString() ?? null,
  };
}

/**
 * Lock guard (B1): refuse any write to a task, harvest, or activity whose season is closed.
 * Records with seasonId === null are not locked.
 */
export async function assertSeasonWritable(
  db: DbClient,
  record: { seasonId: string | null; season?: { status: SeasonStatus } | null },
): Promise<void> {
  if (!record.seasonId) return;

  let status: SeasonStatus | null = record.season?.status ?? null;
  if (status === null) {
    const season = await db.season.findUnique({
      where: { id: record.seasonId },
      select: { status: true },
    });
    status = season?.status ?? null;
  }

  if (status === "closed") {
    throw new HttpError(409, SEASON_ERROR_CODES.SEASON_LOCKED, SEASON_LOCKED_MESSAGE);
  }
}

export async function requireLiveVineyard(
  db: DbClient,
  vineyardId: string,
) {
  const vineyard = await db.vineyard.findFirst({
    where: { id: vineyardId, deletedAt: null },
  });
  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }
  return vineyard;
}

export async function listSeasons(vineyardId: string): Promise<SeasonDto[]> {
  await requireLiveVineyard(prisma, vineyardId);
  const seasons = await prisma.season.findMany({
    where: { vineyardId },
    orderBy: [{ year: "desc" }],
  });
  return seasons.map((season) => serializeSeason(season));
}

export async function getCurrentSeasonState(
  vineyardId: string,
): Promise<CurrentSeasonState> {
  await requireLiveVineyard(prisma, vineyardId);
  const seasons = await prisma.season.findMany({
    where: { vineyardId },
    orderBy: [{ year: "desc" }],
  });
  return deriveDormantState(seasons);
}

export async function getSeasonDetail(
  vineyardId: string,
  seasonId: string,
): Promise<SeasonDto> {
  await requireLiveVineyard(prisma, vineyardId);
  const season = await prisma.season.findFirst({
    where: { id: seasonId, vineyardId },
  });
  if (!season) {
    throw new HttpError(404, "NOT_FOUND", "Season not found");
  }
  return serializeSeason(season, { includeSummary: true });
}
