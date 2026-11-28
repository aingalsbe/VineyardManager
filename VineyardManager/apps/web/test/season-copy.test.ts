import assert from "node:assert/strict";
import test from "node:test";
import { formatNumber, formatPounds, formatShortDate, formatShortMonth } from "../src/lib/format.ts";
import {
  RESTORE_HINT,
  closedSeasonNotice,
  deleteDialogTitle,
  deletedNotice,
  removedToggleLabel,
  resolveSeasonFilter,
  seasonClosedLine,
  seasonEmptyState,
  seasonStartLine,
  startSeasonLabel,
  type SeasonLike,
} from "../src/lib/seasonCopy.ts";

const s = (over: Partial<SeasonLike>): SeasonLike => ({
  id: "x",
  year: 2026,
  status: "active",
  startedAt: null,
  closedAt: null,
  reopenableUntil: null,
  ...over,
});

test("formatShortDate formats calendar dates without a timezone shift", () => {
  assert.equal(formatShortDate("2026-03-08"), "Mar 8, 2026");
  assert.equal(formatShortDate("2026-11-28T18:00:00.000Z"), "Nov 28, 2026");
  assert.equal(formatShortDate(null), "");
  assert.equal(formatShortDate("not a date"), "");
});

test("formatShortMonth and number formatting", () => {
  assert.equal(formatShortMonth("2026-01"), "Jan");
  assert.equal(formatShortMonth("2026-10-15"), "Oct");
  assert.equal(formatNumber(4506), "4,506");
  assert.equal(formatPounds(4506), "4,506 lb");
});

test("'Not started yet' only appears for planned seasons (P2 #8)", () => {
  assert.equal(seasonStartLine(s({ status: "planned" })), "Not started yet");
  assert.equal(seasonStartLine(s({ status: "closed", startedAt: null })), "Start date not recorded");
  assert.equal(seasonStartLine(s({ status: "legacy", startedAt: null })), "Start date not recorded");
  assert.equal(
    seasonStartLine(s({ status: "closed", startedAt: "2026-03-01T18:00:00.000Z" })),
    "Started Mar 1, 2026",
  );
});

test("closed line has no duplicate 'Closed' prefix", () => {
  assert.equal(seasonClosedLine("2026-11-28T18:00:00.000Z"), "Closed Nov 28, 2026");
  assert.equal(seasonClosedLine(null), "Closed");
});

test("start season label is dynamic", () => {
  assert.equal(startSeasonLabel(2027), "Start 2027 season");
  assert.equal(startSeasonLabel(null), "Start season");
});

test("resolveSeasonFilter mirrors the API: active, planned, then latest closed", () => {
  const closed25 = s({ id: "c25", year: 2025, status: "closed" });
  const closed26 = s({ id: "c26", year: 2026, status: "closed" });
  const planned27 = s({ id: "p27", year: 2027, status: "planned" });
  const active26 = s({ id: "a26", year: 2026, status: "active" });
  assert.equal(resolveSeasonFilter([closed25, active26], "current")?.id, "a26");
  assert.equal(resolveSeasonFilter([closed26, planned27], "current")?.id, "p27");
  assert.equal(resolveSeasonFilter([closed25, closed26], "current")?.id, "c26");
  assert.equal(resolveSeasonFilter([closed25], "all"), null);
  assert.equal(resolveSeasonFilter([closed25, closed26], "c25")?.id, "c25");
});

test("season-filtered empty state names the season and offers Show all seasons (P2 #7)", () => {
  assert.deepEqual(seasonEmptyState("harvests", "current", { year: 2026 }), {
    title: "No harvests in the 2026 season yet",
    showAllSeasons: true,
  });
  assert.deepEqual(seasonEmptyState("tasks", "all", null), {
    title: "No tasks yet",
    showAllSeasons: false,
  });
  assert.deepEqual(seasonEmptyState("work log entries", "current", null), {
    title: "No work log entries in this season yet",
    showAllSeasons: true,
  });
});

test("closed-season notice mentions the reopen window only while it is open", () => {
  const now = new Date("2026-11-29T12:00:00.000Z");
  const season = s({ status: "closed", reopenableUntil: "2026-12-28T18:00:00.000Z" });
  assert.equal(
    closedSeasonNotice(season, now),
    "2026 is closed, so these records are read-only. A power user can reopen it in Setup until Dec 28, 2026.",
  );
  assert.equal(
    closedSeasonNotice(season, new Date("2027-01-05T00:00:00.000Z")),
    "2026 is closed, so these records are read-only.",
  );
  assert.equal(closedSeasonNotice(s({ status: "active" }), now), null);
});

test("delete dialog copy follows one pattern with no expiry wording", () => {
  assert.equal(deleteDialogTitle("task"), "Delete task?");
  assert.equal(deleteDialogTitle("harvest"), "Delete harvest?");
  assert.equal(deleteDialogTitle("work entry"), "Delete work entry?");
  assert.equal(deleteDialogTitle("row"), "Delete row?");
  assert.equal(RESTORE_HINT, "You can restore it from Recently removed.");
  assert.doesNotMatch(RESTORE_HINT, /day|expire|permanent|[“”]/i);
  assert.equal(deletedNotice("work entry"), "Work entry deleted. You can restore it from Recently removed.");
});

test("Recently removed toggle label flips to a back label", () => {
  assert.equal(removedToggleLabel(false, "harvests"), "Recently removed");
  assert.equal(removedToggleLabel(true, "work log"), "Back to work log");
});
