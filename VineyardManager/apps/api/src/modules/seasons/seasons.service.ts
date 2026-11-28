import { Prisma, type PrismaClient, type Season } from "@prisma/client";
import {
  ANNUAL_CALENDAR_TEMPLATES,
  OPEN_TASK_STATUSES,
  SEASON_ERROR_CODES,
  SEASON_LOCKED_MESSAGE,
  SEASON_REOPEN_WINDOW_MS,
  annualCalendarDueDate,
  calendarDateInZone,
  healthThresholdsSchema,
  localNoonInZone,
  scoreVineyardHealth,
  type ActivityScope,
  type CloseSeasonPreview,
  type CloseSeasonResult,
  type CurrentSeasonState,
  type HealthScoreActivityInput,
  type HealthScoreRowInput,
  type HealthScoreTaskInput,
  type NewSeasonPreview,
  type NewSeasonResult,
  type NewSeasonSuggestedTask,
  type ReopenSeasonResult,
  type SeasonDto,
  type SeasonStatus,
  type VarietyHarvestTags,
  type YieldUnit,
} from "@vineyard/shared";
import { config } from "../../config.js";
import { prisma } from "../../db/prisma.js";
import { serializeSeason } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { fetchArchiveDateRange } from "../weather/open-meteo.client.js";
import {
  buildSeasonSnapshot,
  computeClosePreviewToken,
  evaluateMidSeasonWarning,
  summarizeSeasonWeatherDays,
  unavailableSeasonWeather,
  type SeasonWeatherSnapshot,
  type SnapshotActivityInput,
  type SnapshotHarvestInput,
  type SnapshotRowInput,
  type SnapshotTaskInput,
} from "./season-snapshot.js";
import { buildSeasonSummaryFromSnapshot } from "./season-summary.js";
import {
  dispatchPendingSeasonSummaryMails,
  enqueueSeasonSummaryMailIntents,
} from "./season-summary-mail.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

const OPEN_TASK_SET = new Set<string>(OPEN_TASK_STATUSES);

export class PreviewStaleError extends HttpError {
  constructor(public readonly freshPreview: CloseSeasonPreview) {
    super(
      409,
      SEASON_ERROR_CODES.PREVIEW_STALE,
      "Season records changed since this preview was loaded. Review the updated counts and confirm again.",
    );
  }
}

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

export async function requireLiveVineyard(db: DbClient, vineyardId: string) {
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

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve optional `?seasonId=` query param for list/metrics routes (G3).
 * - omitted / "" / "all" -> undefined (no filter)
 * - "current" -> active season, else planned season, else latest closed season, else undefined
 * - "<uuid>" -> that season id
 */
export async function resolveSeasonFilter(
  db: DbClient,
  vineyardId: string | null,
  rawSeasonId: unknown,
): Promise<string | undefined> {
  if (typeof rawSeasonId !== "string") return undefined;
  const trimmed = rawSeasonId.trim();
  if (!trimmed || trimmed === "all") return undefined;
  if (trimmed === "current") {
    const where = vineyardId ? { vineyardId } : {};
    const seasons = await db.season.findMany({
      where,
      select: { id: true, status: true, year: true },
      orderBy: [{ year: "desc" }],
    });
    const active = seasons.find((s) => s.status === "active");
    if (active) return active.id;
    const planned = seasons.find((s) => s.status === "planned");
    if (planned) return planned.id;
    const closed = seasons.find((s) => s.status === "closed");
    if (closed) return closed.id;
    return undefined;
  }
  if (!uuidRegex.test(trimmed)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid seasonId filter");
  }
  return trimmed;
}

function parseVarietyCatalog(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

type LoadedCloseContext = {
  vineyard: {
    id: string;
    name: string;
    timezone: string;
    varietyCatalog: string[];
    healthThresholds: ReturnType<typeof healthThresholdsSchema.safeParse> extends {
      data?: infer T;
    }
      ? T | null
      : null;
  };
  season: Season;
  rows: SnapshotRowInput[];
  tasks: SnapshotTaskInput[];
  harvests: SnapshotHarvestInput[];
  activities: SnapshotActivityInput[];
  previousSeasonYear: number | null;
  previousHarvests: SnapshotHarvestInput[];
  untaggedOpenTaskCount: number;
  currentHealth: {
    score: number;
    color: "green" | "yellow" | "orange" | "red";
    reasons: Array<{ code: string; message: string; severity: "green" | "yellow" | "orange" | "red" }>;
  };
  preview: CloseSeasonPreview;
};

async function loadCloseContext(
  db: DbClient,
  vineyardId: string,
  seasonId: string,
  asOf: Date,
): Promise<LoadedCloseContext> {
  const vineyard = await requireLiveVineyard(db, vineyardId);
  const season = await db.season.findFirst({
    where: { id: seasonId, vineyardId },
  });
  if (!season) {
    throw new HttpError(404, "NOT_FOUND", "Season not found");
  }
  if (season.status !== "active") {
    throw new HttpError(
      409,
      SEASON_ERROR_CODES.SEASON_NOT_ACTIVE,
      "Only an active season can be closed.",
    );
  }

  const timeZone = vineyard.timezone || "America/Chicago";
  const asOfDate = calendarDateInZone(asOf, timeZone);
  const catalog = parseVarietyCatalog(vineyard.varietyCatalog);
  const thresholdsParsed = healthThresholdsSchema.safeParse(
    vineyard.healthThresholds,
  );
  const thresholds = thresholdsParsed.success ? thresholdsParsed.data : null;

  const [
    rawRows,
    rawTasks,
    rawHarvests,
    rawActivities,
    untaggedOpenTaskCount,
    prevSeason,
  ] = await Promise.all([
    db.row.findMany({
      where: { vineyardId },
      select: {
        id: true,
        code: true,
        name: true,
        variety: true,
        status: true,
        deletedAt: true,
      },
      orderBy: [{ code: "asc" }],
    }),
    db.task.findMany({
      where: { vineyardId, seasonId, deletedAt: null },
      select: {
        id: true,
        rowId: true,
        title: true,
        dueAt: true,
        status: true,
        updatedAt: true,
        row: { select: { code: true } },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    }),
    db.harvest.findMany({
      where: { vineyardId, seasonId, deletedAt: null },
      select: {
        id: true,
        rowId: true,
        yieldAmount: true,
        yieldUnit: true,
        updatedAt: true,
      },
    }),
    db.activity.findMany({
      where: { vineyardId, seasonId, deletedAt: null },
      select: {
        id: true,
        rowId: true,
        scopeType: true,
        activityType: true,
        performedAt: true,
        updatedAt: true,
        details: true,
        row: { select: { code: true } },
      },
    }),
    db.task.count({
      where: {
        vineyardId,
        seasonId: null,
        deletedAt: null,
        status: { in: [...OPEN_TASK_STATUSES] },
      },
    }),
    db.season.findFirst({
      where: {
        vineyardId,
        year: { lt: season.year },
        status: { in: ["closed", "legacy"] },
      },
      orderBy: { year: "desc" },
      select: { id: true, year: true },
    }),
  ]);

  const rawPrevHarvests = prevSeason
    ? await db.harvest.findMany({
        where: { vineyardId, seasonId: prevSeason.id, deletedAt: null },
        select: {
          id: true,
          rowId: true,
          yieldAmount: true,
          yieldUnit: true,
          updatedAt: true,
        },
      })
    : [];

  const rows: SnapshotRowInput[] = rawRows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    variety: r.variety,
    status: r.status,
    deletedAt: r.deletedAt,
  }));

  const tasks: SnapshotTaskInput[] = rawTasks.map((t) => ({
    id: t.id,
    rowId: t.rowId,
    title: t.title,
    dueAt: t.dueAt,
    status: t.status,
    updatedAt: t.updatedAt,
    rowCode: t.row?.code ?? null,
  }));

  const harvests: SnapshotHarvestInput[] = rawHarvests.map((h) => ({
    id: h.id,
    rowId: h.rowId,
    yieldAmount: Number(h.yieldAmount.toString()),
    yieldUnit: h.yieldUnit as YieldUnit,
    updatedAt: h.updatedAt,
  }));

  const previousHarvests: SnapshotHarvestInput[] = rawPrevHarvests.map((h) => ({
    id: h.id,
    rowId: h.rowId,
    yieldAmount: Number(h.yieldAmount.toString()),
    yieldUnit: h.yieldUnit as YieldUnit,
    updatedAt: h.updatedAt,
  }));

  const activities: SnapshotActivityInput[] = rawActivities.map((a) => ({
    id: a.id,
    rowId: a.rowId,
    scopeType: a.scopeType as ActivityScope,
    activityType: a.activityType,
    performedAt: a.performedAt,
    updatedAt: a.updatedAt,
    details:
      a.details && typeof a.details === "object" && !Array.isArray(a.details)
        ? (a.details as Record<string, unknown>)
        : null,
    rowCode: a.row?.code ?? null,
  }));

  const liveRows = rows.filter((r) => r.deletedAt === null);
  const scoredHealth = scoreVineyardHealth({
    rows: liveRows.map(
      (r): HealthScoreRowInput => ({
        id: r.id,
        code: r.code,
        name: r.name,
        status: r.status,
      }),
    ),
    tasks: tasks
      .filter((t) => OPEN_TASK_SET.has(t.status))
      .map(
        (t): HealthScoreTaskInput => ({
          id: t.id,
          rowId: t.rowId,
          title: t.title,
          dueAt: t.dueAt.toISOString(),
          status: t.status,
        }),
      ),
    activities: activities.map(
      (a): HealthScoreActivityInput => ({
        id: a.id,
        rowId: a.rowId,
        scopeType: a.scopeType,
        activityType: a.activityType,
        performedAt: a.performedAt.toISOString(),
        details: a.details,
      }),
    ),
    healthThresholds: thresholds,
    asOf,
    timeZone,
  });

  const openTasks = tasks.filter((t) => OPEN_TASK_SET.has(t.status));
  const openTasksPreview = openTasks.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: calendarDateInZone(t.dueAt, timeZone),
    status: t.status as "pending" | "sent",
    rowCode: t.rowCode,
  }));

  const previewToken = computeClosePreviewToken({
    seasonId: season.id,
    openTasks,
    tasks,
    harvests,
    activities,
    untaggedOpenTaskCount,
  });

  const midSeason = evaluateMidSeasonWarning({
    seasonYear: season.year,
    asOfDate,
    openTaskDueDates: openTasksPreview.map((t) => t.dueDate),
  });

  // Reuse snapshot builder's harvest/activity aggregation so preview and snapshot match 100%.
  const previewSnapshot = buildSeasonSnapshot({
    vineyardId: vineyard.id,
    vineyardName: vineyard.name,
    timeZone,
    varietyCatalog: catalog,
    healthThresholds: thresholds,
    seasonId: season.id,
    year: season.year,
    startedAt: season.startedAt,
    closedAt: asOf,
    rows,
    tasks,
    harvests,
    previousSeasonYear: prevSeason?.year ?? null,
    previousHarvests,
    activities,
    currentHealth: scoredHealth.vineyard,
    weather: unavailableSeasonWeather(),
  });

  const preview: CloseSeasonPreview = {
    seasonId: season.id,
    year: season.year,
    openTaskCount: openTasksPreview.length,
    openTasks: openTasksPreview,
    untaggedOpenTaskCount,
    harvests: {
      unit: "lb",
      totalLb: previewSnapshot.harvests.totalLb,
      skippedNonLb: previewSnapshot.harvests.skippedNonLb,
      byVariety: previewSnapshot.harvests.byVariety,
      byRow: previewSnapshot.harvests.byRow,
    },
    work: {
      waterings: previewSnapshot.activities.waterings,
      fertilizing: previewSnapshot.activities.fertilizing,
      pestTreatments: previewSnapshot.activities.pestTreatments,
      weedTreatments: previewSnapshot.activities.weedTreatments,
    },
    health: scoredHealth.vineyard,
    midSeason: midSeason.midSeason,
    midSeasonReason: midSeason.midSeasonReason,
    previewToken,
  };

  return {
    vineyard: {
      id: vineyard.id,
      name: vineyard.name,
      timezone: timeZone,
      varietyCatalog: catalog,
      healthThresholds: thresholds,
    },
    season,
    rows,
    tasks,
    harvests,
    activities,
    previousSeasonYear: prevSeason?.year ?? null,
    previousHarvests,
    untaggedOpenTaskCount,
    currentHealth: scoredHealth.vineyard,
    preview,
  };
}

export async function getCloseSeasonPreview(
  vineyardId: string,
  seasonId: string,
  asOf: Date = new Date(),
): Promise<CloseSeasonPreview> {
  const ctx = await loadCloseContext(prisma, vineyardId, seasonId, asOf);
  return ctx.preview;
}

async function fetchSeasonWeatherBestEffort(
  vineyardId: string,
  seasonYear: number,
  asOf: Date,
): Promise<SeasonWeatherSnapshot> {
  try {
    const vineyard = await prisma.vineyard.findFirst({
      where: { id: vineyardId, deletedAt: null },
      select: { lat: true, lng: true, timezone: true },
    });
    if (!vineyard || vineyard.lat == null || vineyard.lng == null) {
      return unavailableSeasonWeather("Weather not available");
    }
    const lat = Number(vineyard.lat.toString());
    const lng = Number(vineyard.lng.toString());
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return unavailableSeasonWeather("Weather not available");
    }
    const timeZone = vineyard.timezone || "America/Chicago";
    const startDate = `${seasonYear}-01-01`;
    const today = calendarDateInZone(asOf, timeZone);
    const yearEnd = `${seasonYear}-12-31`;
    const endDate = today < yearEnd ? today : yearEnd;
    if (endDate < startDate) {
      return unavailableSeasonWeather("Weather not available");
    }
    const days = await fetchArchiveDateRange(
      { lat, lng },
      timeZone,
      startDate,
      endDate,
      4_000,
    );
    return summarizeSeasonWeatherDays(days, startDate, endDate);
  } catch {
    // D-19: weather outage never blocks season close
    return unavailableSeasonWeather("Weather not available");
  }
}

export async function closeSeason(
  vineyardId: string,
  seasonId: string,
  input: {
    previewToken: string;
    actorId: string;
    asOf?: Date;
  },
): Promise<CloseSeasonResult> {
  const now = input.asOf ?? new Date();

  // Pre-check season year for best-effort weather archive lookup outside the DB tx
  const preSeason = await prisma.season.findFirst({
    where: { id: seasonId, vineyardId },
    select: { id: true, year: true, status: true },
  });
  if (!preSeason) {
    await requireLiveVineyard(prisma, vineyardId);
    throw new HttpError(404, "NOT_FOUND", "Season not found");
  }
  if (preSeason.status !== "active") {
    throw new HttpError(
      409,
      SEASON_ERROR_CODES.SEASON_NOT_ACTIVE,
      "Only an active season can be closed.",
    );
  }

  const weather = await fetchSeasonWeatherBestEffort(
    vineyardId,
    preSeason.year,
    now,
  );

  return prisma.$transaction(async (tx) => {
    // Row-level lock guarantees concurrent closes serialize cleanly (A6).
    const locked = await tx.$queryRaw<
      Array<{ id: string; status: string; close_version: number }>
    >`
      SELECT "id", "status"::text AS status, "close_version"
      FROM "seasons"
      WHERE "id" = CAST(${seasonId} AS uuid)
        AND "vineyard_id" = CAST(${vineyardId} AS uuid)
      FOR UPDATE
    `;
    const row = locked[0];
    if (!row) {
      throw new HttpError(404, "NOT_FOUND", "Season not found");
    }
    if (row.status !== "active") {
      throw new HttpError(
        409,
        SEASON_ERROR_CODES.SEASON_NOT_ACTIVE,
        "Only an active season can be closed.",
      );
    }

    const ctx = await loadCloseContext(tx, vineyardId, seasonId, now);
    if (ctx.preview.previewToken !== input.previewToken) {
      throw new PreviewStaleError(ctx.preview);
    }

    const dismissed = await tx.task.updateMany({
      where: {
        vineyardId,
        seasonId,
        deletedAt: null,
        status: { in: [...OPEN_TASK_STATUSES] },
      },
      data: { status: "dismissed" },
    });

    const nextCloseVersion = Number(row.close_version) + 1;

    const snapshot = buildSeasonSnapshot({
      vineyardId: ctx.vineyard.id,
      vineyardName: ctx.vineyard.name,
      timeZone: ctx.vineyard.timezone,
      varietyCatalog: ctx.vineyard.varietyCatalog,
      healthThresholds: ctx.vineyard.healthThresholds,
      seasonId: ctx.season.id,
      year: ctx.season.year,
      startedAt: ctx.season.startedAt,
      closedAt: now,
      rows: ctx.rows,
      tasks: ctx.tasks,
      harvests: ctx.harvests,
      previousSeasonYear: ctx.previousSeasonYear,
      previousHarvests: ctx.previousHarvests,
      activities: ctx.activities,
      currentHealth: ctx.currentHealth,
      weather,
    });

    const summary = buildSeasonSummaryFromSnapshot(snapshot, nextCloseVersion);

    const updated = await tx.season.update({
      where: { id: seasonId },
      data: {
        status: "closed",
        closedAt: now,
        closedBy: input.actorId,
        closeVersion: nextCloseVersion,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        summary: summary as unknown as Prisma.InputJsonValue,
      },
    });

    await enqueueSeasonSummaryMailIntents(tx, {
      vineyardId,
      seasonId,
      closeVersion: nextCloseVersion,
    });

    return {
      season: serializeSeason(updated, { includeSummary: true }),
      dismissedTaskCount: dismissed.count,
    };
  }).then((result) => {
    if (config.seasonSummaryMailWorkerEnabled) {
      void dispatchPendingSeasonSummaryMails().catch(() => {
        console.error("season_summary_mail post_close_dispatch_error code=DRAIN_FAILED");
      });
    }
    return result;
  });
}

/**
 * Reopen a closed season within 30 days of closedAt while dormant (B3, B4, B5, D-14).
 * - Idempotent: if the target season is already active, returns 200 { season, alreadyActive: true }.
 * - Moves current summary into summaryHistory, clears snapshot & summary & closedAt.
 * - Dismissed tasks remain dismissed; planned-season records stay in the planned season.
 */
export async function reopenSeason(
  vineyardId: string,
  seasonId: string,
  options: { now?: Date } = {},
): Promise<ReopenSeasonResult> {
  const now = options.now ?? new Date();
  await requireLiveVineyard(prisma, vineyardId);

  return prisma.$transaction(async (tx) => {
    // Lock all seasons for this vineyard to prevent racing with New Season or concurrent reopen.
    await tx.$queryRaw`
      SELECT "id" FROM "seasons"
      WHERE "vineyard_id" = CAST(${vineyardId} AS uuid)
      FOR UPDATE
    `;

    const allSeasons = await tx.season.findMany({
      where: { vineyardId },
    });
    const target = allSeasons.find((s) => s.id === seasonId);
    if (!target) {
      throw new HttpError(404, "NOT_FOUND", "Season not found");
    }

    if (target.status === "active") {
      return {
        season: serializeSeason(target, { includeSummary: true }),
        alreadyActive: true,
      };
    }

    if (target.status !== "closed") {
      throw new HttpError(
        409,
        SEASON_ERROR_CODES.SEASON_NOT_ACTIVE,
        "Only a closed season can be reopened.",
      );
    }

    const otherActive = allSeasons.find(
      (s) => s.status === "active" && s.id !== seasonId,
    );
    if (otherActive) {
      throw new HttpError(
        409,
        SEASON_ERROR_CODES.NOT_DORMANT,
        `Cannot reopen ${target.year} while the ${otherActive.year} season is active.`,
      );
    }

    if (
      !target.closedAt ||
      now.getTime() > target.closedAt.getTime() + SEASON_REOPEN_WINDOW_MS
    ) {
      throw new HttpError(
        409,
        SEASON_ERROR_CODES.REOPEN_WINDOW_PASSED,
        "This season can no longer be reopened because the 30-day window has passed.",
      );
    }

    const existingHistory = Array.isArray(target.summaryHistory)
      ? [...target.summaryHistory]
      : [];
    if (target.summary && typeof target.summary === "object") {
      existingHistory.push(target.summary);
    }

    const updated = await tx.season.update({
      where: { id: seasonId },
      data: {
        status: "active",
        closedAt: null,
        reopenedAt: now,
        snapshot: Prisma.DbNull,
        summary: Prisma.DbNull,
        summaryHistory: existingHistory as Prisma.InputJsonValue,
      },
    });

    return {
      season: serializeSeason(updated, { includeSummary: true }),
      alreadyActive: false,
    };
  });
}

function parseVarietyHarvestTags(value: unknown): VarietyHarvestTags {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: VarietyHarvestTags = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === "early" || v === "mid" || v === "late") {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Fixed-calendar suggested task list for a given season year (D1, D-15).
 * Dormant Pruning is always first; dates are YYYY-MM-DD in the season year.
 */
export function buildFixedCalendarTasks(year: number): NewSeasonSuggestedTask[] {
  return ANNUAL_CALENDAR_TEMPLATES.map((template) => ({
    templateKey: template.templateKey,
    title: template.title,
    body: template.body,
    stage: template.stage,
    dueDate: annualCalendarDueDate(year, template.month, template.day),
    checked: true,
    relatedActivityType: template.relatedActivityType,
    source: "Fixed calendar fallback",
    isEstimate: false,
    variety: null,
  }));
}

/**
 * Preview for starting a New Season (D1, D-15).
 * Allowed only while the vineyard is dormant (has closed season and no active season).
 */
export async function getNewSeasonPreview(
  vineyardId: string,
): Promise<NewSeasonPreview> {
  const vineyard = await requireLiveVineyard(prisma, vineyardId);
  const seasons = await prisma.season.findMany({
    where: { vineyardId },
    orderBy: [{ year: "desc" }],
  });
  const state = deriveDormantState(seasons);
  if (!state.dormant) {
    throw new HttpError(
      409,
      SEASON_ERROR_CODES.NOT_DORMANT,
      "Close the active season before starting a new season.",
    );
  }

  const year = state.plannedSeason
    ? state.plannedSeason.year
    : state.lastClosedSeason.year + 1;
  const catalog = parseVarietyCatalog(vineyard.varietyCatalog);
  const currentTags = parseVarietyHarvestTags(vineyard.varietyHarvestTags);

  return {
    year,
    plannedSeasonId: state.plannedSeason?.id ?? null,
    calendarSource: "fixed_fallback",
    calendarNote:
      "Using the standard fixed calendar dates for this season year. Review and adjust dates before starting.",
    climateSummary: null,
    varieties: catalog.map((name) => ({
      name,
      currentTag: currentTags[name] ?? null,
      suggestedTag: null,
      suggestionSource: null,
    })),
    tasks: buildFixedCalendarTasks(year),
  };
}

const TEMPLATE_BY_KEY = new Map(
  ANNUAL_CALENDAR_TEMPLATES.map((t) => [t.templateKey, t]),
);

/**
 * Start a New Season while dormant (D2, D3, D-15):
 * - Promotes existing planned season if present (keeping its records) or creates a new active season.
 * - Creates ONLY checked tasks with edited dates in Vineyard.timezone via localNoonInZone.
 * - Serializes concurrent submissions via FOR UPDATE lock + partial unique (season_id, template_key).
 */
export async function createNewSeason(
  vineyardId: string,
  input: {
    year: number;
    tasks: Array<{
      templateKey: string;
      dueDate: string;
      checked: boolean;
      title?: string;
      body?: string;
      relatedActivityType?: NewSeasonSuggestedTask["relatedActivityType"];
    }>;
    varietyHarvestTags?: VarietyHarvestTags;
    actorId: string;
    now?: Date;
  },
): Promise<NewSeasonResult> {
  const now = input.now ?? new Date();
  const vineyard = await requireLiveVineyard(prisma, vineyardId);
  const timeZone = vineyard.timezone || "America/Chicago";

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "seasons"
      WHERE "vineyard_id" = CAST(${vineyardId} AS uuid)
      FOR UPDATE
    `;

    const allSeasons = await tx.season.findMany({
      where: { vineyardId },
      orderBy: [{ year: "desc" }],
    });
    const state = deriveDormantState(allSeasons);
    if (!state.dormant) {
      throw new HttpError(
        409,
        SEASON_ERROR_CODES.NOT_DORMANT,
        "Close the active season before starting a new season.",
      );
    }

    const plannedForYear = allSeasons.find(
      (s) => s.status === "planned" && s.year === input.year,
    );
    const anyExistingForYear = allSeasons.find((s) => s.year === input.year);
    if (anyExistingForYear && anyExistingForYear.status !== "planned") {
      throw new HttpError(
        409,
        SEASON_ERROR_CODES.NOT_DORMANT,
        `A ${input.year} season already exists with status ${anyExistingForYear.status}.`,
      );
    }

    let activeSeason: Season;
    let promotedFromPlanned = false;

    if (plannedForYear) {
      activeSeason = await tx.season.update({
        where: { id: plannedForYear.id },
        data: {
          status: "active",
          startedAt: now,
          startedBy: input.actorId,
        },
      });
      promotedFromPlanned = true;
    } else {
      activeSeason = await tx.season.create({
        data: {
          vineyardId,
          year: input.year,
          status: "active",
          startedAt: now,
          startedBy: input.actorId,
        },
      });
    }

    if (input.varietyHarvestTags) {
      const mergedTags: VarietyHarvestTags = {
        ...parseVarietyHarvestTags(vineyard.varietyHarvestTags),
        ...input.varietyHarvestTags,
      };
      await tx.vineyard.update({
        where: { id: vineyardId },
        data: {
          varietyHarvestTags: mergedTags as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const existingTasks = await tx.task.findMany({
      where: { vineyardId, seasonId: activeSeason.id, deletedAt: null },
      select: { templateKey: true },
    });
    const seenKeys = new Set(
      existingTasks
        .map((t) => t.templateKey)
        .filter((k): k is string => typeof k === "string" && k.length > 0),
    );

    let createdTaskCount = 0;
    for (const item of input.tasks) {
      if (!item.checked) continue;
      const key = item.templateKey.trim();
      if (!key || seenKeys.has(key)) continue;

      const fallback = TEMPLATE_BY_KEY.get(key);
      const title = item.title?.trim() || fallback?.title || key;
      const body = item.body ?? fallback?.body ?? "";
      const relatedActivityType =
        item.relatedActivityType !== undefined
          ? item.relatedActivityType
          : (fallback?.relatedActivityType ?? null);

      await tx.task.create({
        data: {
          vineyardId,
          seasonId: activeSeason.id,
          rowId: null,
          type: "maintenance",
          title,
          body,
          dueAt: localNoonInZone(item.dueDate, timeZone),
          status: "pending",
          relatedActivityType,
          templateKey: key,
        },
      });
      seenKeys.add(key);
      createdTaskCount += 1;
    }

    return {
      season: serializeSeason(activeSeason),
      promotedFromPlanned,
      createdTaskCount,
    };
  });
}


