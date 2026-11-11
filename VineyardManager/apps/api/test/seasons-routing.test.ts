import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { calendarDateInZone } from "@vineyard/shared";
import { test } from "node:test";
import { HttpError } from "../src/middleware/error-handler.js";
import {
  isRetryableSeasonWrite,
  resolveSeasonForWrite,
  runSeasonTransaction,
} from "../src/modules/seasons/season-routing.js";
import {
  assertDisposableSeasonDatabase,
  databaseUrlFromEnv,
  backfillCompletion,
  formatBackfillLine,
  initialTagCount,
  isForeignSeasonAssignment,
  isValidTimeZone,
  localYear,
  localYearStartUtc,
  parseBackfillArgs,
  sanitizeError,
  planVineyardBackfill,
  reconcileTagCounts,
  SKIPPED_CONCURRENT_EXIT_CODE,
  SKIPPED_CONCURRENT_RERUN_MESSAGE,
  tagCountAfterBatch,
  tagCountBeforeBatch,
  type BackfillLine,
  type DatedRow,
  type ExistingSeason,
  type TagActual,
  type TagCountState,
} from "../scripts/backfill-seasons.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "..");
const VINEYARD_ID = "vineyard-1";

type StoredSeason = {
  id: string;
  vineyardId: string;
  year: number;
  status: "legacy" | "active" | "planned" | "closed";
};

type CreateCall = {
  data: Array<{ vineyardId: string; year: number; status: string }>;
  skipDuplicates: boolean;
};

function memoryTx(options: {
  seasons?: StoredSeason[];
  timezone?: string | null;
  onCreate?: (
    data: CreateCall["data"],
    seasons: StoredSeason[],
  ) => { count: number } | never;
}) {
  const seasons = options.seasons ?? [];
  const creates: CreateCall[] = [];
  let rereadAfterFailure = 0;
  let failed = false;
  const tx = {
    season: {
      async findMany(args: { where: { vineyardId: string } }) {
        return seasons
          .filter((season) => season.vineyardId === args.where.vineyardId)
          .map((season) => ({
            id: season.id,
            year: season.year,
            status: season.status,
          }));
      },
      async findFirst(args: {
        where: { vineyardId: string; year?: number; status?: string };
      }) {
        if (failed) rereadAfterFailure += 1;
        const found = seasons.find((season) => {
          if (season.vineyardId !== args.where.vineyardId) return false;
          if (args.where.year !== undefined && season.year !== args.where.year) return false;
          if (args.where.status !== undefined && season.status !== args.where.status) return false;
          return true;
        });
        return found ? { id: found.id } : null;
      },
      async createMany(args: {
        data: CreateCall["data"];
        skipDuplicates?: boolean;
      }) {
        creates.push({
          data: args.data,
          skipDuplicates: args.skipDuplicates === true,
        });
        if (options.onCreate) return options.onCreate(args.data, seasons);
        let count = 0;
        for (const row of args.data) {
          const existing = seasons.find(
            (season) => season.vineyardId === row.vineyardId && season.year === row.year,
          );
          if (existing) {
            if (args.skipDuplicates) continue;
            failed = true;
            const error = new Error("unique");
            Object.assign(error, { code: "P2002" });
            throw error;
          }
          seasons.push({
            id: `season-${row.year}-${row.status}`,
            vineyardId: row.vineyardId,
            year: row.year,
            status: row.status as StoredSeason["status"],
          });
          count += 1;
        }
        return { count };
      },
    },
    vineyard: {
      async findFirst() {
        if (options.timezone === null) return null;
        return { timezone: options.timezone ?? "America/Chicago" };
      },
    },
  };
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    seasons,
    creates,
    rereadAfterFailure: () => rereadAfterFailure,
  };
}

function row(at: string, seasonId: string | null = null): DatedRow {
  return { id: `row-${at}-${seasonId ?? "new"}`, at: new Date(at), seasonId };
}

function season(
  id: string,
  year: number,
  status: ExistingSeason["status"],
): ExistingSeason {
  return { id, vineyardId: VINEYARD_ID, year, status };
}

test("active season is used and nothing is created", async () => {
  const store = memoryTx({
    seasons: [
      { id: "active-id", vineyardId: VINEYARD_ID, year: 1999, status: "active" },
      { id: "planned-id", vineyardId: VINEYARD_ID, year: 2000, status: "planned" },
    ],
  });
  const seasonId = await resolveSeasonForWrite(store.tx, VINEYARD_ID);
  assert.equal(seasonId, "active-id");
  assert.equal(store.creates.length, 0);
});

test("planned season is used when no season is active", async () => {
  const store = memoryTx({
    seasons: [{ id: "planned-id", vineyardId: VINEYARD_ID, year: 2030, status: "planned" }],
  });
  const seasonId = await resolveSeasonForWrite(store.tx, VINEYARD_ID);
  assert.equal(seasonId, "planned-id");
  assert.equal(store.creates.length, 0);
});

test("no seasons creates the current local year as active", async () => {
  const chicago = memoryTx({ timezone: "America/Chicago" });
  const seasonId = await resolveSeasonForWrite(chicago.tx, VINEYARD_ID);
  const year = Number(calendarDateInZone(new Date(), "America/Chicago").slice(0, 4));
  assert.equal(seasonId, `season-${year}-active`);
  assert.equal(chicago.creates.length, 1);
  assert.equal(chicago.creates[0]?.skipDuplicates, true);
  assert.deepEqual(chicago.creates[0]?.data, [
    { vineyardId: VINEYARD_ID, year, status: "active" },
  ]);

  const auckland = memoryTx({ timezone: "Pacific/Auckland" });
  await resolveSeasonForWrite(auckland.tx, VINEYARD_ID);
  const aucklandYear = Number(calendarDateInZone(new Date(), "Pacific/Auckland").slice(0, 4));
  assert.equal(auckland.creates[0]?.data[0]?.year, aucklandYear);
});

test("no seasons and an invalid timezone is setup required, not a 500", async () => {
  const store = memoryTx({ timezone: "Not/AZone", seasons: [] });
  await assert.rejects(
    () => resolveSeasonForWrite(store.tx, VINEYARD_ID),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error instanceof RangeError, false);
      assert.equal(error.status, 409);
      assert.equal(error.code, "SEASON_SETUP_REQUIRED");
      return true;
    },
  );
  assert.equal(store.creates.length, 0);
  assert.equal(store.seasons.length, 0);
});

test("closed seasons create planned for the latest closed year plus one", async () => {
  const store = memoryTx({
    seasons: [
      { id: "old", vineyardId: VINEYARD_ID, year: 2019, status: "closed" },
      { id: "newer", vineyardId: VINEYARD_ID, year: 2022, status: "closed" },
      { id: "legacy", vineyardId: VINEYARD_ID, year: 2018, status: "legacy" },
    ],
  });
  const seasonId = await resolveSeasonForWrite(store.tx, VINEYARD_ID);
  assert.equal(seasonId, "season-2023-planned");
  assert.deepEqual(store.creates[0]?.data, [
    { vineyardId: VINEYARD_ID, year: 2023, status: "planned" },
  ]);
});

test("a closed current year is not reused for a write", async () => {
  const store = memoryTx({
    seasons: [{ id: "closed-now", vineyardId: VINEYARD_ID, year: 2024, status: "closed" }],
  });
  const seasonId = await resolveSeasonForWrite(store.tx, VINEYARD_ID);
  assert.equal(seasonId, "season-2025-planned");
  assert.notEqual(store.creates[0]?.data[0]?.year, 2024);
});

test("legacy-only seasons throw setup required and create nothing", async () => {
  const store = memoryTx({
    seasons: [{ id: "legacy-id", vineyardId: VINEYARD_ID, year: 2018, status: "legacy" }],
  });
  await assert.rejects(
    () => resolveSeasonForWrite(store.tx, VINEYARD_ID),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "SEASON_SETUP_REQUIRED");
      return true;
    },
  );
  assert.equal(store.creates.length, 0);
  assert.equal(store.seasons.length, 1);
});

test("planned year already taken does not invent another year", async () => {
  const store = memoryTx({
    seasons: [
      { id: "closed", vineyardId: VINEYARD_ID, year: 2024, status: "closed" },
      { id: "legacy-next", vineyardId: VINEYARD_ID, year: 2025, status: "legacy" },
    ],
  });
  await assert.rejects(
    () => resolveSeasonForWrite(store.tx, VINEYARD_ID),
    (error: unknown) => error instanceof HttpError && error.code === "SEASON_SETUP_REQUIRED",
  );
  assert.deepEqual(store.creates[0]?.data, [
    { vineyardId: VINEYARD_ID, year: 2025, status: "planned" },
  ]);
  assert.equal(store.seasons.some((item) => item.status === "planned"), false);
});

test("skipDuplicates re-reads the season inserted by the other writer", async () => {
  const store = memoryTx({
    onCreate(data, seasons) {
      const row = data[0];
      assert.ok(row);
      seasons.push({
        id: "peer",
        vineyardId: row.vineyardId,
        year: row.year,
        status: "active",
      });
      return { count: 0 };
    },
  });
  const seasonId = await resolveSeasonForWrite(store.tx, VINEYARD_ID);
  assert.equal(seasonId, "peer");
  assert.equal(store.creates[0]?.skipDuplicates, true);
});

test("a missing vineyard does not create a season", async () => {
  const store = memoryTx({ timezone: null });
  await assert.rejects(
    () => resolveSeasonForWrite(store.tx, VINEYARD_ID),
    (error: unknown) => error instanceof HttpError && error.code === "NOT_FOUND",
  );
  assert.equal(store.creates.length, 0);
});

test("a unique failure retries the whole transaction once and does not continue", async () => {
  let attempts = 0;
  let rereadAfterFailure = 0;
  const client = {
    async $transaction(fn: (tx: Prisma.TransactionClient) => Promise<string>) {
      attempts += 1;
      const fail = attempts === 1;
      let failed = false;
      const store = memoryTx({
        onCreate() {
          if (fail) {
            failed = true;
            const error = new Error("unique");
            Object.assign(error, { code: "P2002" });
            throw error;
          }
          return { count: 1 };
        },
      });
      const original = store.tx.season.findFirst;
      store.tx.season.findFirst = async (args) => {
        if (failed) rereadAfterFailure += 1;
        return original(args);
      };
      if (!fail) {
        store.seasons.push({
          id: "created",
          vineyardId: VINEYARD_ID,
          year: 2026,
          status: "active",
        });
      }
      return fn(store.tx);
    },
  };
  const seasonId = await runSeasonTransaction(
    client as unknown as PrismaClient,
    VINEYARD_ID,
    async (_tx, id) => id,
  );
  assert.equal(attempts, 2);
  assert.equal(rereadAfterFailure, 0);
  assert.equal(seasonId, "created");
});

test("serialization failure retries once and a second failure is thrown", async () => {
  for (const code of ["P2034", "40001"]) {
    let attempts = 0;
    const client = {
      async $transaction() {
        attempts += 1;
        const error = new Error("serialization");
        Object.assign(error, { code });
        throw error;
      },
    };
    await assert.rejects(() =>
      runSeasonTransaction(client as unknown as PrismaClient, VINEYARD_ID, async () => "ok"),
    );
    assert.equal(attempts, 2);
  }

  let messageAttempts = 0;
  const messageClient = {
    async $transaction() {
      messageAttempts += 1;
      throw new Error("could not serialize access due to concurrent update");
    },
  };
  await assert.rejects(() =>
    runSeasonTransaction(
      messageClient as unknown as PrismaClient,
      VINEYARD_ID,
      async () => "ok",
    ),
  );
  assert.equal(messageAttempts, 2);
});

test("setup errors are not retried", async () => {
  let attempts = 0;
  const client = {
    async $transaction(fn: (tx: Prisma.TransactionClient) => Promise<string>) {
      attempts += 1;
      const store = memoryTx({
        seasons: [{ id: "legacy", vineyardId: VINEYARD_ID, year: 2018, status: "legacy" }],
      });
      return fn(store.tx);
    },
  };
  await assert.rejects(
    () => runSeasonTransaction(client as unknown as PrismaClient, VINEYARD_ID, async () => "ok"),
    (error: unknown) => error instanceof HttpError && error.code === "SEASON_SETUP_REQUIRED",
  );
  assert.equal(attempts, 1);
  assert.equal(isRetryableSeasonWrite(new HttpError(409, "SEASON_SETUP_REQUIRED", "no")), false);
  assert.equal(isRetryableSeasonWrite(Object.assign(new Error("unique"), { code: "P2002" })), true);
  assert.equal(isRetryableSeasonWrite(new Error("nope")), false);
});

test("local year bounds follow the vineyard zone, including DST", () => {
  const chicagoStart = localYearStartUtc(2025, "America/Chicago");
  assert.equal(chicagoStart.toISOString(), "2025-01-01T06:00:00.000Z");
  assert.equal(calendarDateInZone(chicagoStart, "America/Chicago"), "2025-01-01");
  const justBefore = new Date(chicagoStart.getTime() - 1);
  assert.equal(calendarDateInZone(justBefore, "America/Chicago"), "2024-12-31");
  assert.equal(localYear(new Date("2025-01-01T05:30:00.000Z"), "America/Chicago"), 2024);
  assert.equal(localYear(new Date("2025-01-01T06:00:00.000Z"), "America/Chicago"), 2025);

  const aucklandStart = localYearStartUtc(2021, "Pacific/Auckland");
  assert.equal(aucklandStart.toISOString(), "2020-12-31T11:00:00.000Z");
  assert.equal(localYear(new Date("2020-12-31T10:30:00.000Z"), "Pacific/Auckland"), 2020);
  assert.equal(localYear(new Date("2020-12-31T11:30:00.000Z"), "Pacific/Auckland"), 2021);

  assert.equal(localYear(new Date("2024-11-03T06:30:00.000Z"), "America/Chicago"), 2024);
  assert.equal(localYear(new Date("2024-11-03T07:30:00.000Z"), "America/Chicago"), 2024);
  assert.equal(localYear(new Date("2024-03-10T08:30:00.000Z"), "America/Chicago"), 2024);
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.equal(isValidTimeZone("America/Chicago"), true);
});

test("backfill plan tags local years and does not invent future or closure", () => {
  const now = new Date("2026-06-15T17:00:00.000Z");
  const plan = planVineyardBackfill({
    ordinal: 2,
    vineyardId: VINEYARD_ID,
    timeZone: "America/Chicago",
    now,
    tasks: [
      row("2025-01-01T05:30:00.000Z"),
      row("2025-01-01T06:00:00.000Z"),
      row("2030-06-01T17:00:00.000Z"),
    ],
    harvests: [],
    activities: [
      row("2024-11-03T06:30:00.000Z"),
      row("2024-11-03T07:30:00.000Z"),
      row("2024-03-10T08:30:00.000Z"),
    ],
    seasons: [],
  });
  assert.deepEqual(
    plan.creates.map((item) => item.year),
    [2024, 2025, 2026],
  );
  assert.equal(plan.creates.find((item) => item.year === 2026)?.status, "active");
  assert.equal(plan.creates.find((item) => item.year === 2024)?.status, "legacy");
  assert.equal(plan.creates.some((item) => item.year === 2030), false);
  const task2024 = plan.tags.find((tag) => tag.table === "tasks" && tag.year === 2024);
  const task2025 = plan.tags.find((tag) => tag.table === "tasks" && tag.year === 2025);
  assert.equal(task2024?.count, 1);
  assert.equal(task2025?.count, 1);
  assert.equal(plan.tags.find((tag) => tag.table === "activities" && tag.year === 2024)?.count, 3);
  assert.equal(plan.lines.find((line) => line.reason === "future_year")?.count, 1);
  assert.equal(plan.lines.some((line) => line.year === 2030 && line.reason === "create_legacy"), false);
});

test("auckland local new year is not the UTC year", () => {
  const plan = planVineyardBackfill({
    ordinal: 1,
    vineyardId: VINEYARD_ID,
    timeZone: "Pacific/Auckland",
    now: new Date("2026-06-15T17:00:00.000Z"),
    tasks: [],
    harvests: [
      row("2020-12-31T10:30:00.000Z"),
      row("2020-12-31T11:30:00.000Z"),
    ],
    activities: [],
    seasons: [],
  });
  assert.equal(plan.tags.find((tag) => tag.year === 2020)?.count, 1);
  assert.equal(plan.tags.find((tag) => tag.year === 2021)?.count, 1);
  assert.equal(plan.creates.some((item) => item.year === 2020 && item.status === "legacy"), true);
  assert.equal(plan.creates.some((item) => item.year === 2021 && item.status === "legacy"), true);
});

test("closed current year is not reset to active", () => {
  const plan = planVineyardBackfill({
    ordinal: 1,
    vineyardId: VINEYARD_ID,
    timeZone: "America/Chicago",
    now: new Date("2026-06-15T17:00:00.000Z"),
    tasks: [row("2026-07-01T17:00:00.000Z"), row("2020-07-01T17:00:00.000Z")],
    harvests: [],
    activities: [],
    seasons: [season("closed-current", 2026, "closed")],
  });
  assert.equal(plan.creates.some((item) => item.status === "active"), false);
  assert.deepEqual(plan.creates, [{ year: 2020, status: "legacy" }]);
  assert.equal(plan.tags.find((tag) => tag.year === 2026)?.count, 1);
});

test("preassigned rows stay put and foreign assignments are only reported", () => {
  const plan = planVineyardBackfill({
    ordinal: 4,
    vineyardId: VINEYARD_ID,
    timeZone: "UTC",
    now: new Date("2026-06-15T17:00:00.000Z"),
    tasks: [
      row("2021-06-01T00:00:00.000Z", "kept"),
      row("2021-06-02T00:00:00.000Z"),
      row("2021-06-03T00:00:00.000Z", "missing"),
    ],
    harvests: [],
    activities: [],
    seasons: [season("kept", 2019, "legacy")],
  });
  assert.equal(plan.tags.find((tag) => tag.year === 2021)?.count, 1);
  assert.equal(
    plan.lines.find((line) => line.reason === "foreign_assignment")?.count,
    1,
  );
  assert.equal(plan.creates.some((item) => item.year === 2019), false);
  assert.equal(isForeignSeasonAssignment("missing", [season("kept", 2019, "legacy")], VINEYARD_ID), true);
  assert.equal(isForeignSeasonAssignment("kept", [season("kept", 2019, "legacy")], VINEYARD_ID), false);
  assert.equal(isForeignSeasonAssignment(null, [], VINEYARD_ID), false);
  assert.equal(
    isForeignSeasonAssignment("kept", [{ id: "kept", vineyardId: "other" }], VINEYARD_ID),
    true,
  );
});

test("invalid time zones are skipped with every row counted", () => {
  const plan = planVineyardBackfill({
    ordinal: 3,
    vineyardId: VINEYARD_ID,
    timeZone: "Not/AZone",
    now: new Date("2026-06-15T17:00:00.000Z"),
    tasks: [row("2020-01-01T00:00:00.000Z"), row("2020-01-02T00:00:00.000Z", "already")],
    harvests: [row("2020-01-03T00:00:00.000Z")],
    activities: [],
    seasons: [],
  });
  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.tags, []);
  assert.equal(plan.lines.find((line) => line.table === "tasks")?.count, 2);
  assert.equal(plan.lines.find((line) => line.table === "harvests")?.reason, "invalid_timezone");
});

test("a prior active season leaves later untagged rows counted and uncreated", () => {
  const plan = planVineyardBackfill({
    ordinal: 1,
    vineyardId: VINEYARD_ID,
    timeZone: "America/Chicago",
    now: new Date("2027-06-15T17:00:00.000Z"),
    tasks: [
      row("2026-12-15T18:00:00.000Z"),
      row("2027-03-02T17:00:00.000Z"),
      row("2027-11-01T17:00:00.000Z"),
      row("2027-08-01T17:00:00.000Z", "active-2026"),
    ],
    harvests: [row("2027-08-01T17:00:00.000Z")],
    activities: [
      row("2024-06-01T17:00:00.000Z"),
      row("2028-02-01T17:00:00.000Z"),
    ],
    seasons: [season("active-2026", 2026, "active")],
  });
  assert.deepEqual(plan.creates, [{ year: 2024, status: "legacy" }]);
  assert.equal(plan.creates.some((item) => item.year === 2027 || item.status === "active"), false);
  assert.equal(plan.tags.find((tag) => tag.table === "tasks" && tag.year === 2026)?.count, 1);
  assert.equal(plan.tags.find((tag) => tag.table === "activities" && tag.year === 2024)?.count, 1);
  assert.equal(plan.tags.some((tag) => tag.year === 2027), false);
  const untaggedTasks = plan.lines.find(
    (line) => line.table === "tasks" && line.year === 2027 && line.reason === "untagged_no_season",
  );
  assert.ok(untaggedTasks);
  assert.equal(untaggedTasks.count, 2);
  assert.equal(
    formatBackfillLine(untaggedTasks),
    "vineyard=1 year=2027 table=tasks reason=untagged_no_season count=2",
  );
  assert.equal(
    plan.lines.find((line) => line.table === "harvests" && line.reason === "untagged_no_season")?.count,
    1,
  );
  assert.equal(plan.lines.find((line) => line.reason === "future_year")?.year, 2028);
  assert.equal(plan.lines.filter((line) => line.reason === "untagged_no_season").length, 2);
});

test("an existing legacy current year is not replaced", () => {
  const plan = planVineyardBackfill({
    ordinal: 1,
    vineyardId: VINEYARD_ID,
    timeZone: "UTC",
    now: new Date("2026-06-15T17:00:00.000Z"),
    tasks: [row("2026-02-01T00:00:00.000Z"), row("2026-02-02T00:00:00.000Z")],
    harvests: [],
    activities: [],
    seasons: [season("legacy-current", 2026, "legacy")],
  });
  assert.deepEqual(plan.creates, []);
  assert.equal(plan.tags[0]?.count, 2);
});

test("backfill lines contain counts only", () => {
  const line = formatBackfillLine({
    vineyardOrdinal: 2,
    year: 2020,
    table: "tasks",
    reason: "tag",
    count: 4,
  });
  assert.equal(line, "vineyard=2 year=2020 table=tasks reason=tag count=4");
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(line), false);
  assert.deepEqual(parseBackfillArgs([]), { apply: false, databaseUrlEnv: null });
  assert.deepEqual(parseBackfillArgs(["--database-url-env", "SEASONS_TEST_DATABASE_URL"]), {
    apply: false,
    databaseUrlEnv: "SEASONS_TEST_DATABASE_URL",
  });
  assert.throws(
    () => parseBackfillArgs(["--apply"]),
    (error: unknown) =>
      error instanceof Error && error.message === "--apply requires --database-url-env <NAME>",
  );
  assert.throws(
    () => parseBackfillArgs(["--nope"]),
    (error: unknown) => error instanceof Error && error.message === "Unknown argument",
  );
  assert.throws(
    () => databaseUrlFromEnv("SEASONS_STEP1_UNSET_VAR"),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "Environment variable SEASONS_STEP1_UNSET_VAR is not set",
  );
});

test("disposable season database guard refuses a shared database before any write", () => {
  assert.doesNotThrow(() =>
    assertDisposableSeasonDatabase({
      vineyardCount: 0,
      userCount: 0,
      disposableFlag: "1",
    }),
  );
  assert.throws(
    () =>
      assertDisposableSeasonDatabase({
        vineyardCount: 2,
        userCount: 0,
        disposableFlag: "1",
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("not empty") &&
      error.message.includes("vineyardCount=2") &&
      !error.message.includes("postgres"),
  );
  assert.throws(
    () =>
      assertDisposableSeasonDatabase({
        vineyardCount: 0,
        userCount: 1,
        disposableFlag: "1",
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("not empty") &&
      error.message.includes("userCount=1"),
  );
  assert.throws(
    () =>
      assertDisposableSeasonDatabase({
        vineyardCount: 0,
        userCount: 0,
        disposableFlag: undefined,
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message ===
        "SEASONS_TEST_DB_DISPOSABLE=1 is required before the season integration test writes",
  );
  assert.throws(
    () =>
      assertDisposableSeasonDatabase({
        vineyardCount: 0,
        userCount: 0,
        disposableFlag: "true",
      }),
    (error: unknown) =>
      error instanceof Error && error.message.includes("SEASONS_TEST_DB_DISPOSABLE=1"),
  );
});

function applyBatches(
  planned: number,
  maxBatches: number | null,
  updates: readonly number[],
  startBatches = 0,
): { state: TagCountState; stoppedEarly: boolean; consumed: number } {
  let state = initialTagCount(startBatches);
  let consumed = 0;
  while (true) {
    const decision = tagCountBeforeBatch(state, planned, maxBatches);
    if (decision === "done") return { state, stoppedEarly: false, consumed };
    if (decision === "stop-early") return { state, stoppedEarly: true, consumed };
    const batchUpdated = updates[consumed];
    assert.ok(batchUpdated !== undefined);
    consumed += 1;
    state = tagCountAfterBatch(state, planned, batchUpdated);
  }
}

test("tag counts report rows updated, including an early batch cap", () => {
  const finished = applyBatches(3, null, [1, 1, 1]);
  assert.equal(finished.stoppedEarly, false);
  assert.equal(finished.state.updated, 3);
  assert.equal(finished.state.skippedConcurrent, 0);
  assert.equal(finished.consumed, 3);

  const capped = applyBatches(3, 1, [1, 1, 1]);
  assert.equal(capped.stoppedEarly, true);
  assert.equal(capped.state.updated, 1);
  assert.equal(capped.state.skippedConcurrent, 0);
  assert.equal(capped.consumed, 1);

  const notStarted = applyBatches(4, 0, [1, 1]);
  assert.equal(notStarted.stoppedEarly, true);
  assert.equal(notStarted.state.updated, 0);
  assert.equal(notStarted.state.skippedConcurrent, 0);
  assert.equal(notStarted.consumed, 0);

  const resumed = applyBatches(3, 2, [1], 1);
  assert.equal(resumed.stoppedEarly, true);
  assert.equal(resumed.state.updated, 1);
  assert.equal(resumed.state.batchesUsed, 2);
  assert.equal(resumed.state.skippedConcurrent, 0);
});

test("a row that stops qualifying is skipped_concurrent and not a failed count", () => {
  const lost = applyBatches(3, null, [0]);
  assert.equal(lost.stoppedEarly, false);
  assert.equal(lost.state.done, true);
  assert.equal(lost.state.updated, 0);
  assert.equal(lost.state.skippedConcurrent, 3);

  const partial = applyBatches(5, null, [2, 1, 0]);
  assert.equal(partial.state.updated, 3);
  assert.equal(partial.state.skippedConcurrent, 2);
  assert.equal(partial.state.done, true);
  assert.equal(partial.consumed, 3);

  const cappedRemainder = applyBatches(5, 1, [2, 0]);
  assert.equal(cappedRemainder.stoppedEarly, true);
  assert.equal(cappedRemainder.state.updated, 2);
  assert.equal(cappedRemainder.state.skippedConcurrent, 0);
  assert.equal(cappedRemainder.consumed, 1);
});

test("reconcile replaces planned tag counts and keeps an early stop partial", () => {
  const lines: BackfillLine[] = [
    { vineyardOrdinal: 1, year: 2020, table: "tasks", reason: "tag", count: 3 },
    { vineyardOrdinal: 1, year: 2020, table: "harvests", reason: "tag", count: 1 },
    { vineyardOrdinal: 1, year: 2020, table: "seasons", reason: "create_legacy", count: 1 },
    { vineyardOrdinal: 1, year: 2028, table: "tasks", reason: "future_year", count: 1 },
    { vineyardOrdinal: 2, year: 2021, table: "activities", reason: "tag", count: 4 },
    { vineyardOrdinal: 2, year: 2021, table: "seasons", reason: "create_legacy", count: 1 },
  ];
  const full: TagActual[] = [
    { vineyardOrdinal: 1, table: "tasks", year: 2020, updated: 3, skippedConcurrent: 0 },
    { vineyardOrdinal: 1, table: "harvests", year: 2020, updated: 1, skippedConcurrent: 0 },
    { vineyardOrdinal: 2, table: "activities", year: 2021, updated: 4, skippedConcurrent: 0 },
  ];
  assert.deepEqual(
    reconcileTagCounts(lines, full, { stoppedEarly: false, createdOrdinals: new Set([1, 2]) }),
    lines,
  );

  const stopped = reconcileTagCounts(
    lines,
    [{ vineyardOrdinal: 1, table: "tasks", year: 2020, updated: 1, skippedConcurrent: 0 }],
    { stoppedEarly: true, createdOrdinals: new Set([1]) },
  );
  assert.deepEqual(stopped, [
    { vineyardOrdinal: 1, year: 2020, table: "tasks", reason: "tag", count: 1 },
    { vineyardOrdinal: 1, year: 2020, table: "seasons", reason: "create_legacy", count: 1 },
    { vineyardOrdinal: 1, year: 2028, table: "tasks", reason: "future_year", count: 1 },
  ]);

  const skipped = reconcileTagCounts(
    lines,
    [
      { vineyardOrdinal: 1, table: "tasks", year: 2020, updated: 1, skippedConcurrent: 2 },
      { vineyardOrdinal: 1, table: "harvests", year: 2020, updated: 0, skippedConcurrent: 1 },
      { vineyardOrdinal: 2, table: "activities", year: 2021, updated: 4, skippedConcurrent: 0 },
    ],
    { stoppedEarly: false, createdOrdinals: new Set([1, 2]) },
  );
  const taskSkip = skipped.find(
    (line) => line.table === "tasks" && line.reason === "skipped_concurrent",
  );
  assert.ok(taskSkip);
  assert.equal(taskSkip.count, 2);
  assert.equal(
    formatBackfillLine(taskSkip),
    "vineyard=1 year=2020 table=tasks reason=skipped_concurrent count=2",
  );
  assert.equal(
    skipped.find((line) => line.table === "tasks" && line.reason === "tag")?.count,
    1,
  );
  assert.equal(
    skipped.some((line) => line.table === "harvests" && line.reason === "tag"),
    false,
  );
  assert.equal(
    skipped.find((line) => line.table === "harvests" && line.reason === "skipped_concurrent")?.count,
    1,
  );
  assert.equal(skipped.some((line) => line.reason === "future_year"), true);
  assert.equal(skipped.some((line) => line.count <= 0), false);
});

test("skipped_concurrent asks for a rerun and uses its own exit code", () => {
  assert.equal(SKIPPED_CONCURRENT_EXIT_CODE, 2);
  assert.notEqual(SKIPPED_CONCURRENT_EXIT_CODE, 1);
  assert.deepEqual(backfillCompletion([]), { exitCode: 0, rerunMessage: null });
  assert.deepEqual(
    backfillCompletion([
      { vineyardOrdinal: 1, year: 2020, table: "tasks", reason: "tag", count: 3 },
    ]),
    { exitCode: 0, rerunMessage: null },
  );
  assert.deepEqual(
    backfillCompletion([
      {
        vineyardOrdinal: 1,
        year: 2020,
        table: "tasks",
        reason: "skipped_concurrent",
        count: 0,
      },
    ]),
    { exitCode: 0, rerunMessage: null },
  );
  const completion = backfillCompletion([
    { vineyardOrdinal: 1, year: 2020, table: "tasks", reason: "tag", count: 1 },
    {
      vineyardOrdinal: 1,
      year: 2020,
      table: "tasks",
      reason: "skipped_concurrent",
      count: 1,
    },
  ]);
  assert.equal(completion.exitCode, SKIPPED_CONCURRENT_EXIT_CODE);
  assert.equal(completion.rerunMessage, SKIPPED_CONCURRENT_RERUN_MESSAGE);
  assert.equal(completion.rerunMessage?.includes("rerun required"), true);
  assert.equal(completion.rerunMessage?.includes("postgres"), false);
});

test("apply without --database-url-env exits before any database work", async () => {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/backfill-seasons.ts", "--apply"],
    { cwd: apiRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const [code] = (await once(child, "exit")) as [number | null];
  const combined = `${stdout}\n${stderr}`;
  assert.equal(code, 1);
  assert.equal(combined.includes("--apply requires --database-url-env"), true);
  assert.equal(combined.includes("postgres://"), false);
  assert.equal(combined.includes("postgresql://"), false);
});

test("sanitizeError drops driver text and keeps allowlisted metadata", () => {
  const sentinels = [
    "owner@example.invalid",
    "db.internal.example",
    "vineyard_user",
    "tok_secret_value",
    "postgres://vineyard_user:tok_secret_value@db.internal.example:5432/vineyard",
    "user=vineyard_user host=db.internal.example",
  ];
  const driverText = sentinels.join(" ");
  const sanitized = sanitizeError(
    Object.assign(new Error(driverText), {
      code: "P2002",
      vineyardOrdinal: 3,
      table: "tasks",
      count: 4,
      meta: { host: "db.internal.example", user: "vineyard_user", email: "owner@example.invalid" },
    }),
  );
  assert.equal(sanitized, "code=P2002 vineyard=3 table=tasks count=4");
  for (const sentinel of sentinels) {
    assert.equal(sanitized.includes(sentinel), false);
  }
  assert.equal(sanitized.includes("postgres"), false);

  const unknown = sanitizeError(new Error(driverText));
  assert.equal(unknown, "code=backfill_failed");
  for (const sentinel of sentinels) {
    assert.equal(unknown.includes(sentinel), false);
  }

  const dirtyAllowlist = sanitizeError(
    new Error(`--apply requires --database-url-env <NAME> ${driverText}`),
  );
  assert.equal(dirtyAllowlist, "code=backfill_failed");
  assert.equal(dirtyAllowlist.includes("tok_secret_value"), false);
  assert.equal(dirtyAllowlist.includes("user=vineyard_user"), false);

  const unsafeFields = sanitizeError({
    code: "password=tok_secret_value",
    message: driverText,
    table: "users",
    count: "4",
    vineyardOrdinal: 1.5,
    meta: { table: "pg_catalog", count: -1 },
  });
  assert.equal(unsafeFields, "code=backfill_failed");
  for (const sentinel of sentinels) {
    assert.equal(unsafeFields.includes(sentinel), false);
  }

  assert.equal(
    sanitizeError(new Error("--apply requires --database-url-env <NAME>")),
    "--apply requires --database-url-env <NAME>",
  );
  assert.equal(
    sanitizeError(Object.assign(new Error(driverText), { code: "23505", meta: { table: "harvests", count: 1 } })),
    "code=23505 table=harvests count=1",
  );
});

test("historical years use the full year token and setUTCFullYear", () => {
  const year50 = new Date(0);
  year50.setUTCFullYear(50, 0, 1);
  year50.setUTCHours(0, 0, 0, 0);
  assert.equal(localYear(year50, "UTC"), 50);
  const start50 = localYearStartUtc(50, "UTC");
  assert.equal(start50.getUTCFullYear(), 50);
  assert.equal(start50.getUTCFullYear() === 1950, false);
  assert.equal(calendarDateInZone(start50, "UTC"), "50-01-01");
  const justBefore = new Date(start50.getTime() - 1);
  assert.equal(calendarDateInZone(justBefore, "UTC"), "49-12-31");
  assert.equal(localYear(justBefore, "UTC"), 49);

  const year2026 = new Date("2026-06-15T12:00:00.000Z");
  assert.equal(localYear(year2026, "UTC"), 2026);
  const start2026 = localYearStartUtc(2026, "UTC");
  assert.equal(start2026.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(calendarDateInZone(start2026, "UTC"), "2026-01-01");
  assert.equal(localYear(start2026, "UTC"), 2026);

  assert.throws(
    () => localYear(year2026, "Not/AZone"),
    (error: unknown) => error instanceof Error && error.message === "invalid local year",
  );
  assert.throws(
    () => localYearStartUtc(275761, "UTC"),
    (error: unknown) => error instanceof Error && error.message === "invalid local year",
  );
});

test("routing stores the full current calendar year token", async () => {
  const store = memoryTx({ timezone: "UTC" });
  await resolveSeasonForWrite(store.tx, VINEYARD_ID);
  const formatted = calendarDateInZone(new Date(), "UTC");
  const token = formatted.split("-")[0] ?? "";
  const year = Number(token);
  assert.equal(/^\d+$/.test(token), true);
  assert.equal(store.creates[0]?.data[0]?.year, year);
  assert.equal(store.creates[0]?.data[0]?.year, localYear(new Date(), "UTC"));
});
