import assert from "node:assert/strict";
import { test } from "node:test";
import type { Season } from "@prisma/client";
import {
  ANNUAL_CALENDAR_TEMPLATES,
  CALENDAR_TEMPLATES,
  SEASON_ERROR_CODES,
  SEASON_LOCKED_MESSAGE,
  calendarDateInZone,
  localNoonInZone,
} from "@vineyard/shared";
import {
  formatInternalErrorLog,
  HttpError,
} from "../src/middleware/error-handler.js";
import {
  assertSeasonWritable,
  deriveDormantState,
} from "../src/modules/seasons/seasons.service.js";

function makeSeason(overrides: Partial<Season>): Season {
  const now = new Date("2026-06-01T12:00:00.000Z");
  return {
    id: "00000000-0000-4000-8000-000000000001",
    vineyardId: "00000000-0000-4000-8000-000000000010",
    year: 2026,
    status: "active",
    startedAt: now,
    closedAt: null,
    reopenedAt: null,
    startedBy: null,
    closedBy: null,
    closeVersion: 0,
    snapshot: null,
    summary: null,
    summaryHistory: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("deriveDormantState returns non-dormant when active season exists", () => {
  const active = makeSeason({ id: "s-2026", year: 2026, status: "active" });
  const closed = makeSeason({
    id: "s-2025",
    year: 2025,
    status: "closed",
    closedAt: new Date("2025-11-15T18:00:00.000Z"),
  });
  const state = deriveDormantState([active, closed]);
  assert.equal(state.dormant, false);
  assert.equal(state.dormantSince, null);
  assert.equal(state.season?.id, "s-2026");
  assert.equal(state.lastClosedSeason?.id, "s-2025");
  assert.equal(state.plannedSeason, null);
});

test("deriveDormantState returns dormant when closed exists and no active exists", () => {
  const closed2025 = makeSeason({
    id: "s-2025",
    year: 2025,
    status: "closed",
    closedAt: new Date("2025-11-15T18:00:00.000Z"),
  });
  const closed2026 = makeSeason({
    id: "s-2026",
    year: 2026,
    status: "closed",
    closedAt: new Date("2026-11-12T18:00:00.000Z"),
  });
  const planned2027 = makeSeason({
    id: "s-2027",
    year: 2027,
    status: "planned",
    startedAt: null,
  });

  const state = deriveDormantState([closed2025, closed2026, planned2027]);
  assert.equal(state.dormant, true);
  assert.equal(state.dormantSince, "2026-11-12T18:00:00.000Z");
  assert.equal(state.season, null);
  assert.equal(state.lastClosedSeason.id, "s-2026");
  assert.equal(state.lastClosedSeason.reopenableUntil, "2026-12-12T18:00:00.000Z");
  assert.equal(state.plannedSeason?.id, "s-2027");
});

test("deriveDormantState returns non-dormant when empty or legacy-only", () => {
  assert.equal(deriveDormantState([]).dormant, false);
  const legacy = makeSeason({ id: "s-2024", year: 2024, status: "legacy" });
  const state = deriveDormantState([legacy]);
  assert.equal(state.dormant, false);
  assert.equal(state.season, null);
});

test("assertSeasonWritable allows null, active, planned, legacy and rejects closed with 409 SEASON_LOCKED", async () => {
  let dbLookups = 0;
  const fakeDb = {
    season: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        dbLookups += 1;
        if (where.id === "closed-id") return { status: "closed" as const };
        return { status: "active" as const };
      },
    },
  };

  // Untagged record (seasonId null) is never locked
  await assertSeasonWritable(fakeDb as never, { seasonId: null });
  assert.equal(dbLookups, 0);

  // Preloaded active / planned / legacy skip extra query
  await assertSeasonWritable(fakeDb as never, {
    seasonId: "a",
    season: { status: "active" },
  });
  await assertSeasonWritable(fakeDb as never, {
    seasonId: "p",
    season: { status: "planned" },
  });
  await assertSeasonWritable(fakeDb as never, {
    seasonId: "l",
    season: { status: "legacy" },
  });
  assert.equal(dbLookups, 0);

  // Preloaded closed throws 409 SEASON_LOCKED
  await assert.rejects(
    () =>
      assertSeasonWritable(fakeDb as never, {
        seasonId: "c",
        season: { status: "closed" },
      }),
    (err: unknown) =>
      err instanceof HttpError &&
      err.status === 409 &&
      err.code === SEASON_ERROR_CODES.SEASON_LOCKED &&
      err.message === SEASON_LOCKED_MESSAGE,
  );
  assert.equal(dbLookups, 0);

  // Fallback DB lookup when relation not included
  await assertSeasonWritable(fakeDb as never, { seasonId: "active-id" });
  assert.equal(dbLookups, 1);
  await assert.rejects(
    () => assertSeasonWritable(fakeDb as never, { seasonId: "closed-id" }),
    (err: unknown) =>
      err instanceof HttpError &&
      err.status === 409 &&
      err.code === SEASON_ERROR_CODES.SEASON_LOCKED,
  );
  assert.equal(dbLookups, 2);
});

test("formatInternalErrorLog redacts SQL, values, URLs, emails, and Prisma stack snippets (G5)", () => {
  const prismaErr = new Error(
    'Invalid `tx.task.create()` invocation in /home/antigravity/apps/api/src/foo.ts:57:12\n' +
      'SELECT * FROM users WHERE email = \'secret@abidevine.test\' AND url = \'https://secret.example/token=abc\'',
  );
  prismaErr.name = "PrismaClientKnownRequestError";
  Object.assign(prismaErr, { code: "P2002" });

  const req = {
    method: "POST",
    path: "/api/v1/vineyards/fef3f6ab-8f92-4d7f-94ab-546b361d7e8c/schedule/seed",
    baseUrl: "/api/v1/vineyards/:vineyardId/schedule",
    route: { path: "/seed" },
    headers: { "x-request-id": "req-abc123" },
  };

  const line = formatInternalErrorLog(prismaErr, req as never);
  assert.equal(line.includes("\n"), false);
  assert.ok(line.includes("500 POST /api/v1/vineyards/:vineyardId/schedule/seed"));
  assert.ok(line.includes("req=req-abc123"));
  assert.ok(line.includes("err=PrismaClientKnownRequestError"));
  assert.ok(line.includes("code=P2002"));

  for (const forbidden of [
    "SELECT",
    "secret@abidevine.test",
    "https://secret.example",
    "token=abc",
    "foo.ts",
    "tx.task.create",
    "fef3f6ab",
  ]) {
    assert.equal(line.includes(forbidden), false, `log leaked: ${forbidden}`);
  }
});

test("formatInternalErrorLog drops arbitrary error codes and emails/URLs in unrouted paths", () => {
  const err = new Error("something with owner@example.com");
  err.name = "CustomSensitiveName";
  Object.assign(err, { code: "SECRET_CODE_VALUE" });

  const req = {
    method: "GET",
    path: "/api/v1/users/owner@example.com/https://evil.test/x",
    baseUrl: "",
    headers: {},
  };

  const line = formatInternalErrorLog(err, req as never);
  assert.ok(line.includes("err=Error"));
  assert.ok(line.includes("code=INTERNAL_ERROR"));
  assert.equal(line.includes("CustomSensitiveName"), false);
  assert.equal(line.includes("SECRET_CODE_VALUE"), false);
  assert.equal(line.includes("owner@example.com"), false);
  assert.equal(line.includes("https://evil.test"), false);
});

test("CALENDAR_TEMPLATES have unique templateKeys and localNoonInZone preserves date across timezones and DST", () => {
  assert.equal(CALENDAR_TEMPLATES.length, ANNUAL_CALENDAR_TEMPLATES.length);
  const keys = CALENDAR_TEMPLATES.map((t) => t.templateKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(CALENDAR_TEMPLATES[0]?.templateKey, "dormant_prune");

  // DST spring-forward day in Chicago (2026-03-08)
  const chicagoNoon = localNoonInZone("2026-03-08", "America/Chicago");
  assert.equal(calendarDateInZone(chicagoNoon, "America/Chicago"), "2026-03-08");
  assert.equal(chicagoNoon.toISOString(), "2026-03-08T17:00:00.000Z"); // CDT = UTC-5 at noon

  // Non-US timezone (Pacific/Auckland, UTC+13 in Jan)
  const aucklandNoon = localNoonInZone("2027-01-01", "Pacific/Auckland");
  assert.equal(calendarDateInZone(aucklandNoon, "Pacific/Auckland"), "2027-01-01");
  assert.equal(aucklandNoon.toISOString(), "2026-12-31T23:00:00.000Z");
});
