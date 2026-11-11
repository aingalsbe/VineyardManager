import { Prisma, PrismaClient } from "@prisma/client";
import { calendarDateInZone } from "@vineyard/shared";
import { pathToFileURL } from "node:url";

const DEFAULT_BATCH_SIZE = 200;

export type BackfillTable = "tasks" | "harvests" | "activities" | "seasons";
export type BackfillRecordTable = "tasks" | "harvests" | "activities";
export type BackfillReason =
  | "create_legacy"
  | "create_active"
  | "tag"
  | "skipped_concurrent"
  | "untagged_no_season"
  | "future_year"
  | "invalid_timezone"
  | "foreign_assignment";

export type BackfillLine = {
  vineyardOrdinal: number;
  year: number | null;
  table: BackfillTable;
  reason: BackfillReason;
  count: number;
};

export type SeasonStatusName = "legacy" | "active" | "planned" | "closed";

export type DatedRow = {
  id: string;
  at: Date;
  seasonId: string | null;
};

export type ExistingSeason = {
  id: string;
  vineyardId: string;
  year: number;
  status: SeasonStatusName;
};

export type SeasonCreate = {
  year: number;
  status: "legacy" | "active";
};

export type TagPlan = {
  table: BackfillRecordTable;
  year: number;
  start: Date;
  end: Date;
  count: number;
};

export type VineyardPlan = {
  lines: BackfillLine[];
  creates: SeasonCreate[];
  tags: TagPlan[];
};

type RecordGroups = Record<BackfillRecordTable, DatedRow[]>;

const TABLE_ORDER: Record<BackfillTable, number> = {
  tasks: 0,
  harvests: 1,
  activities: 2,
  seasons: 3,
};

const REASON_ORDER: Record<BackfillReason, number> = {
  create_legacy: 0,
  create_active: 1,
  tag: 2,
  skipped_concurrent: 3,
  untagged_no_season: 4,
  future_year: 5,
  foreign_assignment: 6,
  invalid_timezone: 7,
};

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function localYear(date: Date, timeZone: string): number {
  return yearToken(calendarDateText(date, timeZone));
}

const yearStartCache = new Map<string, Date>();

/** First UTC instant whose local calendar date is January 1 of `year`. */
export function localYearStartUtc(year: number, timeZone: string): Date {
  const key = `${timeZone}|${year}`;
  const cached = yearStartCache.get(key);
  if (cached) return cached;
  if (!Number.isSafeInteger(year)) {
    throw new Error("invalid local year");
  }
  const anchor = new Date(0);
  anchor.setUTCFullYear(year, 0, 1);
  anchor.setUTCHours(0, 0, 0, 0);
  const anchorMs = anchor.getTime();
  if (!Number.isFinite(anchorMs) || anchor.getUTCFullYear() !== year) {
    throw new Error("invalid local year");
  }
  let lo = anchorMs - 18 * 60 * 60 * 1000;
  let hi = anchorMs + 18 * 60 * 60 * 1000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDateOrder(new Date(mid), timeZone, year, 1, 1) < 0) lo = mid + 1;
    else hi = mid;
  }
  const found = new Date(lo);
  if (localDateOrder(found, timeZone, year, 1, 1) !== 0) {
    throw new Error("invalid local year");
  }
  yearStartCache.set(key, found);
  return found;
}

function calendarDateText(date: Date, timeZone: string): string {
  try {
    return calendarDateInZone(date, timeZone);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error("invalid local year");
    }
    throw error;
  }
}

/** First `-`-separated field. `calendarDateInZone` does not pad years 0–999. */
function yearToken(formatted: string): number {
  const token = formatted.split("-")[0] ?? "";
  if (!/^-?\d+$/.test(token)) {
    throw new Error("invalid local year");
  }
  const year = Number(token);
  if (!Number.isSafeInteger(year)) {
    throw new Error("invalid local year");
  }
  return year;
}

/** Numeric year/month/day order so padding cannot move the January 1 target. */
function localDateOrder(
  date: Date,
  timeZone: string,
  year: number,
  month: number,
  day: number,
): number {
  const parts = calendarDateText(date, timeZone).split("-");
  if (parts.length !== 3) {
    throw new Error("invalid local year");
  }
  const yearPart = parts[0];
  const monthPart = parts[1];
  const dayPart = parts[2];
  if (
    yearPart === undefined ||
    monthPart === undefined ||
    dayPart === undefined ||
    !/^-?\d+$/.test(yearPart) ||
    !/^\d+$/.test(monthPart) ||
    !/^\d+$/.test(dayPart)
  ) {
    throw new Error("invalid local year");
  }
  const y = Number(yearPart);
  const m = Number(monthPart);
  const d = Number(dayPart);
  if (!Number.isSafeInteger(y) || !Number.isSafeInteger(m) || !Number.isSafeInteger(d)) {
    throw new Error("invalid local year");
  }
  if (y !== year) return y < year ? -1 : 1;
  if (m !== month) return m < month ? -1 : 1;
  if (d !== day) return d < day ? -1 : 1;
  return 0;
}

export function isForeignSeasonAssignment(
  seasonId: string | null,
  seasons: ReadonlyArray<Pick<ExistingSeason, "id" | "vineyardId">>,
  vineyardId: string,
): boolean {
  if (seasonId == null) return false;
  const season = seasons.find((item) => item.id === seasonId);
  if (!season) return true;
  return season.vineyardId !== vineyardId;
}

export function formatBackfillLine(line: BackfillLine): string {
  const year = line.year == null ? "" : String(line.year);
  return `vineyard=${line.vineyardOrdinal} year=${year} table=${line.table} reason=${line.reason} count=${line.count}`;
}

/** Distinct from the generic failure exit code 1. */
export const SKIPPED_CONCURRENT_EXIT_CODE = 2;

export const SKIPPED_CONCURRENT_RERUN_MESSAGE = "skipped_concurrent>0: rerun required";

/** A positive skipped_concurrent count means eligible rows may remain. Rerun until it is gone. */
export function backfillCompletion(lines: readonly BackfillLine[]): {
  exitCode: number;
  rerunMessage: string | null;
} {
  const skipped = lines.some((line) => line.reason === "skipped_concurrent" && line.count > 0);
  if (!skipped) return { exitCode: 0, rerunMessage: null };
  return {
    exitCode: SKIPPED_CONCURRENT_EXIT_CODE,
    rerunMessage: SKIPPED_CONCURRENT_RERUN_MESSAGE,
  };
}

export function parseBackfillArgs(argv: readonly string[]): {
  apply: boolean;
  databaseUrlEnv: string | null;
} {
  let apply = false;
  let databaseUrlEnv: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--database-url-env") {
      const name = argv[index + 1];
      if (name === undefined || name.startsWith("--")) {
        throw new Error("--database-url-env requires <NAME>");
      }
      databaseUrlEnv = name;
      index += 1;
      continue;
    }
    throw new Error("Unknown argument");
  }
  if (apply && databaseUrlEnv == null) {
    throw new Error("--apply requires --database-url-env <NAME>");
  }
  return { apply, databaseUrlEnv };
}

/**
 * The season integration test writes rows and calls apply with no vineyard filter.
 * Call this after counting, and before any insert, so a shared database is refused.
 */
export function assertDisposableSeasonDatabase(input: {
  vineyardCount: number;
  userCount: number;
  disposableFlag: string | undefined;
}): void {
  if (input.disposableFlag !== "1") {
    throw new Error(
      "SEASONS_TEST_DB_DISPOSABLE=1 is required before the season integration test writes",
    );
  }
  if (
    !Number.isInteger(input.vineyardCount) ||
    !Number.isInteger(input.userCount) ||
    input.vineyardCount !== 0 ||
    input.userCount !== 0
  ) {
    throw new Error(
      `Season integration test refused to write because the database is not empty vineyardCount=${input.vineyardCount} userCount=${input.userCount}`,
    );
  }
}

export function databaseUrlFromEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

export function planVineyardBackfill(input: {
  ordinal: number;
  vineyardId: string;
  timeZone: string;
  now: Date;
  tasks: DatedRow[];
  harvests: DatedRow[];
  activities: DatedRow[];
  seasons: ExistingSeason[];
}): VineyardPlan {
  const groups: RecordGroups = {
    tasks: input.tasks,
    harvests: input.harvests,
    activities: input.activities,
  };
  if (!isValidTimeZone(input.timeZone)) {
    const lines: BackfillLine[] = [];
    for (const table of recordTables()) {
      const count = groups[table].length;
      if (count > 0) {
        lines.push({
          vineyardOrdinal: input.ordinal,
          year: null,
          table,
          reason: "invalid_timezone",
          count,
        });
      }
    }
    return { lines, creates: [], tags: [] };
  }

  const currentYear = localYear(input.now, input.timeZone);
  const counted = new Map<string, number>();
  const add = (
    year: number | null,
    table: BackfillTable,
    reason: BackfillReason,
    amount = 1,
  ): void => {
    const key = `${year ?? ""}|${table}|${reason}`;
    counted.set(key, (counted.get(key) ?? 0) + amount);
  };

  const yearsWithRecords = new Set<number>();
  for (const table of recordTables()) {
    for (const row of groups[table]) {
      const year = localYear(row.at, input.timeZone);
      const start = localYearStartUtc(year, input.timeZone);
      const end = localYearStartUtc(year + 1, input.timeZone);
      const time = row.at.getTime();
      if (time < start.getTime() || time >= end.getTime()) {
        throw new Error(
          `year boundary mismatch vineyard=${input.ordinal} year=${year} table=${table}`,
        );
      }
      yearsWithRecords.add(year);
      if (isForeignSeasonAssignment(row.seasonId, input.seasons, input.vineyardId)) {
        add(year, table, "foreign_assignment");
        continue;
      }
      if (row.seasonId != null) continue;
      if (year > currentYear) add(year, table, "future_year");
    }
  }

  const creates = seasonsToCreate(input.seasons, yearsWithRecords, currentYear);
  const seasonYears = new Set(input.seasons.map((season) => season.year));
  for (const create of creates) seasonYears.add(create.year);

  const tags: TagPlan[] = [];
  for (const table of recordTables()) {
    const untaggedByYear = new Map<number, number>();
    for (const row of groups[table]) {
      if (row.seasonId != null) continue;
      const year = localYear(row.at, input.timeZone);
      if (year > currentYear) continue;
      // A prior active season blocks a new current year. Count those rows; do not invent a season.
      if (!seasonYears.has(year)) {
        add(year, table, "untagged_no_season");
        continue;
      }
      untaggedByYear.set(year, (untaggedByYear.get(year) ?? 0) + 1);
    }
    for (const [year, count] of untaggedByYear) {
      if (count <= 0) continue;
      tags.push({
        table,
        year,
        start: localYearStartUtc(year, input.timeZone),
        end: localYearStartUtc(year + 1, input.timeZone),
        count,
      });
      add(year, table, "tag", count);
    }
  }

  for (const create of creates) {
    add(
      create.year,
      "seasons",
      create.status === "legacy" ? "create_legacy" : "create_active",
    );
  }

  const lines: BackfillLine[] = [];
  for (const [key, count] of counted) {
    if (count <= 0) continue;
    const [yearText, tableText, reasonText] = key.split("|");
    if (tableText === undefined || reasonText === undefined) continue;
    lines.push({
      vineyardOrdinal: input.ordinal,
      year: yearText === undefined || yearText === "" ? null : Number(yearText),
      table: tableText as BackfillTable,
      reason: reasonText as BackfillReason,
      count,
    });
  }
  lines.sort(compareLines);
  tags.sort((a, b) => a.year - b.year || TABLE_ORDER[a.table] - TABLE_ORDER[b.table]);
  return { lines, creates, tags };
}

function seasonsToCreate(
  seasons: readonly ExistingSeason[],
  yearsWithRecords: ReadonlySet<number>,
  currentYear: number,
): SeasonCreate[] {
  const byYear = new Map(seasons.map((season) => [season.year, season]));
  const creates: SeasonCreate[] = [];
  const pastYears = [...yearsWithRecords].filter((year) => year < currentYear).sort((a, b) => a - b);
  for (const year of pastYears) {
    if (!byYear.has(year)) creates.push({ year, status: "legacy" });
  }
  const current = byYear.get(currentYear);
  const currentBlocks =
    current != null &&
    (current.status === "active" || current.status === "planned" || current.status === "closed");
  const vineyardHasActive = seasons.some((season) => season.status === "active");
  if (!currentBlocks && current == null && !vineyardHasActive) {
    creates.push({ year: currentYear, status: "active" });
  }
  return creates;
}

function recordTables(): BackfillRecordTable[] {
  return ["tasks", "harvests", "activities"];
}

function compareLines(a: BackfillLine, b: BackfillLine): number {
  if (a.vineyardOrdinal !== b.vineyardOrdinal) return a.vineyardOrdinal - b.vineyardOrdinal;
  const yearA = a.year ?? -1;
  const yearB = b.year ?? -1;
  if (yearA !== yearB) return yearA - yearB;
  if (TABLE_ORDER[a.table] !== TABLE_ORDER[b.table]) return TABLE_ORDER[a.table] - TABLE_ORDER[b.table];
  return REASON_ORDER[a.reason] - REASON_ORDER[b.reason];
}

export type TagCountState = {
  updated: number;
  skippedConcurrent: number;
  batchesUsed: number;
  done: boolean;
};

export function initialTagCount(batchesUsed: number): TagCountState {
  return { updated: 0, skippedConcurrent: 0, batchesUsed, done: false };
}

/** Whether the next UPDATE may run. A batch cap stops without counting the remainder as skipped. */
export function tagCountBeforeBatch(
  state: TagCountState,
  planned: number,
  maxBatches: number | null,
): "run" | "stop-early" | "done" {
  if (state.done || state.updated >= planned) return "done";
  if (maxBatches != null && state.batchesUsed >= maxBatches) return "stop-early";
  return "run";
}

/**
 * Apply one UPDATE's row count. Zero means the remaining planned rows no longer qualify.
 * Those rows are skipped_concurrent, not a failed backfill.
 */
export function tagCountAfterBatch(
  state: TagCountState,
  planned: number,
  batchUpdated: number,
): TagCountState {
  const batchesUsed = state.batchesUsed + 1;
  if (batchUpdated <= 0) {
    return {
      updated: state.updated,
      skippedConcurrent: state.skippedConcurrent + Math.max(0, planned - state.updated),
      batchesUsed,
      done: true,
    };
  }
  const updated = state.updated + batchUpdated;
  return {
    updated,
    skippedConcurrent: state.skippedConcurrent,
    batchesUsed,
    done: updated >= planned,
  };
}

export type TagActual = {
  vineyardOrdinal: number;
  table: BackfillRecordTable;
  year: number;
  updated: number;
  skippedConcurrent: number;
};

/** Replace planned tag counts with rows actually updated. Omit zeros. */
export function reconcileTagCounts(
  lines: readonly BackfillLine[],
  actuals: readonly TagActual[],
  early?: {
    stoppedEarly: boolean;
    createdOrdinals: ReadonlySet<number>;
  },
): BackfillLine[] {
  const byKey = new Map(
    actuals.map((actual) => [
      `${actual.vineyardOrdinal}|${actual.table}|${actual.year}`,
      actual,
    ]),
  );
  const result: BackfillLine[] = [];
  for (const line of lines) {
    if (
      early?.stoppedEarly &&
      (line.reason === "create_legacy" || line.reason === "create_active") &&
      !early.createdOrdinals.has(line.vineyardOrdinal)
    ) {
      continue;
    }
    if (line.reason !== "tag") {
      result.push(line);
      continue;
    }
    const actual = byKey.get(`${line.vineyardOrdinal}|${line.table}|${line.year}`);
    if (!actual || actual.updated <= 0) continue;
    result.push({ ...line, count: actual.updated });
  }
  for (const actual of actuals) {
    if (actual.skippedConcurrent <= 0) continue;
    result.push({
      vineyardOrdinal: actual.vineyardOrdinal,
      year: actual.year,
      table: actual.table,
      reason: "skipped_concurrent",
      count: actual.skippedConcurrent,
    });
  }
  result.sort(compareLines);
  return result;
}

export async function runBackfill(options: {
  databaseUrl: string;
  mode: "dry-run" | "apply";
  now?: Date;
  batchSize?: number;
  maxTagBatches?: number;
}): Promise<BackfillLine[]> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("batchSize must be a positive integer");
  }
  if (
    options.maxTagBatches != null &&
    (!Number.isInteger(options.maxTagBatches) || options.maxTagBatches < 0)
  ) {
    throw new Error("maxTagBatches must be a non-negative integer");
  }
  const prisma = new PrismaClient({
    datasources: { db: { url: options.databaseUrl } },
  });
  try {
    const vineyards = await prisma.vineyard.findMany({
      where: { deletedAt: null },
      select: { id: true, timezone: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const planned: Array<{ vineyardId: string; ordinal: number; plan: VineyardPlan }> = [];
    for (let index = 0; index < vineyards.length; index += 1) {
      const vineyard = vineyards[index];
      if (!vineyard) continue;
      const loaded = await loadVineyardRows(prisma, vineyard.id);
      planned.push({
        vineyardId: vineyard.id,
        ordinal: index + 1,
        plan: planVineyardBackfill({
          ordinal: index + 1,
          vineyardId: vineyard.id,
          timeZone: vineyard.timezone,
          now,
          tasks: loaded.tasks,
          harvests: loaded.harvests,
          activities: loaded.activities,
          seasons: loaded.seasons,
        }),
      });
    }
    const lines = planned.flatMap((item) => item.plan.lines);
    if (options.mode === "apply") {
      const outcome = await applyPlans(prisma, planned, batchSize, options.maxTagBatches);
      return reconcileTagCounts(lines, outcome.actuals, {
        stoppedEarly: outcome.stoppedEarly,
        createdOrdinals: outcome.createdOrdinals,
      });
    }
    return lines;
  } finally {
    await prisma.$disconnect();
  }
}

async function loadVineyardRows(
  prisma: PrismaClient,
  vineyardId: string,
): Promise<{
  tasks: DatedRow[];
  harvests: DatedRow[];
  activities: DatedRow[];
  seasons: ExistingSeason[];
}> {
  const [tasks, harvests, activities, seasons] = await Promise.all([
    prisma.task.findMany({
      where: { vineyardId },
      select: { id: true, dueAt: true, seasonId: true },
    }),
    prisma.harvest.findMany({
      where: { vineyardId },
      select: { id: true, harvestedAt: true, seasonId: true },
    }),
    prisma.activity.findMany({
      where: { vineyardId },
      select: { id: true, performedAt: true, seasonId: true },
    }),
    prisma.season.findMany({
      where: { vineyardId },
      select: { id: true, vineyardId: true, year: true, status: true },
    }),
  ]);
  return {
    tasks: tasks.map((row) => ({ id: row.id, at: row.dueAt, seasonId: row.seasonId })),
    harvests: harvests.map((row) => ({
      id: row.id,
      at: row.harvestedAt,
      seasonId: row.seasonId,
    })),
    activities: activities.map((row) => ({
      id: row.id,
      at: row.performedAt,
      seasonId: row.seasonId,
    })),
    seasons,
  };
}

async function applyPlans(
  prisma: PrismaClient,
  planned: ReadonlyArray<{ vineyardId: string; ordinal: number; plan: VineyardPlan }>,
  batchSize: number,
  maxTagBatches: number | undefined,
): Promise<{
  actuals: TagActual[];
  createdOrdinals: Set<number>;
  stoppedEarly: boolean;
}> {
  const actuals: TagActual[] = [];
  const createdOrdinals = new Set<number>();
  let batchesUsed = 0;
  const batchCap = maxTagBatches ?? null;
  for (const item of planned) {
    if (item.plan.creates.length > 0) {
      await prisma.$transaction((tx) =>
        tx.season.createMany({
          data: item.plan.creates.map((create) => ({
            vineyardId: item.vineyardId,
            year: create.year,
            status: create.status,
          })),
          skipDuplicates: true,
        }),
      );
    }
    createdOrdinals.add(item.ordinal);
    if (item.plan.tags.length === 0) continue;
    const seasons = await prisma.season.findMany({
      where: { vineyardId: item.vineyardId },
      select: { id: true, year: true },
    });
    const seasonByYear = new Map(seasons.map((season) => [season.year, season.id]));
    for (const tag of item.plan.tags) {
      const seasonId = seasonByYear.get(tag.year);
      if (seasonId === undefined) {
        throw new Error(`missing season vineyard=${item.ordinal} year=${tag.year}`);
      }
      let state = initialTagCount(batchesUsed);
      while (true) {
        const decision = tagCountBeforeBatch(state, tag.count, batchCap);
        if (decision === "done") break;
        if (decision === "stop-early") {
          if (state.updated > 0 || state.skippedConcurrent > 0) {
            actuals.push({
              vineyardOrdinal: item.ordinal,
              table: tag.table,
              year: tag.year,
              updated: state.updated,
              skippedConcurrent: state.skippedConcurrent,
            });
          }
          return { actuals, createdOrdinals, stoppedEarly: true };
        }
        const updated = await prisma.$transaction((tx) =>
          tagBatch(tx, tag, seasonId, item.vineyardId, batchSize),
        );
        state = tagCountAfterBatch(state, tag.count, updated);
        batchesUsed = state.batchesUsed;
      }
      actuals.push({
        vineyardOrdinal: item.ordinal,
        table: tag.table,
        year: tag.year,
        updated: state.updated,
        skippedConcurrent: state.skippedConcurrent,
      });
    }
  }
  return { actuals, createdOrdinals, stoppedEarly: false };
}

export function tagBatch(
  tx: Prisma.TransactionClient,
  tag: TagPlan,
  seasonId: string,
  vineyardId: string,
  batchSize: number,
): Promise<number> {
  const limit = Prisma.raw(String(batchSize));
  // Outer predicates are rechecked after a lock wait. The id list alone must not assign a row.
  if (tag.table === "tasks") {
    return tx.$executeRaw`
      UPDATE "tasks"
      SET "season_id" = CAST(${seasonId} AS uuid)
      WHERE "season_id" IS NULL
        AND "vineyard_id" = CAST(${vineyardId} AS uuid)
        AND "due_at" >= ${tag.start}
        AND "due_at" < ${tag.end}
        AND "id" IN (
          SELECT "id" FROM "tasks"
          WHERE "season_id" IS NULL
            AND "vineyard_id" = CAST(${vineyardId} AS uuid)
            AND "due_at" >= ${tag.start}
            AND "due_at" < ${tag.end}
          LIMIT ${limit}
        )
    `;
  }
  if (tag.table === "harvests") {
    return tx.$executeRaw`
      UPDATE "harvests"
      SET "season_id" = CAST(${seasonId} AS uuid)
      WHERE "season_id" IS NULL
        AND "vineyard_id" = CAST(${vineyardId} AS uuid)
        AND "harvested_at" >= ${tag.start}
        AND "harvested_at" < ${tag.end}
        AND "id" IN (
          SELECT "id" FROM "harvests"
          WHERE "season_id" IS NULL
            AND "vineyard_id" = CAST(${vineyardId} AS uuid)
            AND "harvested_at" >= ${tag.start}
            AND "harvested_at" < ${tag.end}
          LIMIT ${limit}
        )
    `;
  }
  return tx.$executeRaw`
    UPDATE "activities"
    SET "season_id" = CAST(${seasonId} AS uuid)
    WHERE "season_id" IS NULL
      AND "vineyard_id" = CAST(${vineyardId} AS uuid)
      AND "performed_at" >= ${tag.start}
      AND "performed_at" < ${tag.end}
      AND "id" IN (
        SELECT "id" FROM "activities"
        WHERE "season_id" IS NULL
          AND "vineyard_id" = CAST(${vineyardId} AS uuid)
          AND "performed_at" >= ${tag.start}
          AND "performed_at" < ${tag.end}
        LIMIT ${limit}
      )
  `;
}

const SAFE_EXACT_MESSAGES = new Set([
  "--apply requires --database-url-env <NAME>",
  "--database-url-env requires <NAME>",
  "Unknown argument",
  "invalid local year",
  "batchSize must be a positive integer",
  "maxTagBatches must be a non-negative integer",
  "Backfill failed",
]);

const SAFE_TABLES = new Set(["tasks", "harvests", "activities", "seasons"]);

/**
 * Stderr text for a failed CLI run.
 * Known argument and year errors keep their exact sentence.
 * Anything else is an allowlisted code plus ordinal, table, and count.
 * The driver message is never copied.
 */
export function sanitizeError(error: unknown): string {
  if (
    error instanceof Error &&
    (SAFE_EXACT_MESSAGES.has(error.message) ||
      /^Environment variable [A-Z0-9_]+ is not set$/.test(error.message))
  ) {
    return error.message;
  }
  const record = asRecord(error);
  const meta = record ? asRecord(record.meta) : null;
  const parts = [`code=${allowlistedCode(record)}`];
  const ordinal = firstSafeInt(record, meta, ["vineyardOrdinal", "ordinal"]);
  const table = firstSafeTable(record, meta);
  const count = firstSafeInt(record, meta, ["count"]);
  if (ordinal != null) parts.push(`vineyard=${ordinal}`);
  if (table != null) parts.push(`table=${table}`);
  if (count != null) parts.push(`count=${count}`);
  return parts.join(" ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function allowlistedCode(record: Record<string, unknown> | null): string {
  const code = record?.code;
  if (typeof code !== "string") return "backfill_failed";
  if (/^P\d{4}$/.test(code) || code === "40001" || code === "23505" || code === "23503" || code === "40P01") {
    return code;
  }
  return "backfill_failed";
}

function firstSafeInt(
  record: Record<string, unknown> | null,
  meta: Record<string, unknown> | null,
  keys: readonly string[],
): number | null {
  for (const source of [record, meta]) {
    if (!source) continue;
    for (const key of keys) {
      const value = safeInt(source[key]);
      if (value != null) return value;
    }
  }
  return null;
}

function firstSafeTable(
  record: Record<string, unknown> | null,
  meta: Record<string, unknown> | null,
): string | null {
  for (const source of [record, meta]) {
    if (!source) continue;
    const table = source.table;
    if (typeof table === "string" && SAFE_TABLES.has(table)) return table;
  }
  return null;
}

function safeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  if (value < 0 || value > 1_000_000_000) return null;
  return value;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = parseBackfillArgs(process.argv.slice(2));
  const envName = args.databaseUrlEnv ?? "DATABASE_URL";
  const databaseUrl = databaseUrlFromEnv(envName);
  const lines = await runBackfill({
    databaseUrl,
    mode: args.apply ? "apply" : "dry-run",
  });
  for (const line of lines) {
    process.stdout.write(`${formatBackfillLine(line)}\n`);
  }
  const completion = backfillCompletion(lines);
  if (completion.rerunMessage != null) {
    process.stderr.write(`${completion.rerunMessage}\n`);
    process.exitCode = completion.exitCode;
  }
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    process.stderr.write(`${sanitizeError(error)}\n`);
    process.exitCode = 1;
  });
}
