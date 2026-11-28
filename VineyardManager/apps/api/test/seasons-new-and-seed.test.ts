import assert from "node:assert/strict";
import test from "node:test";
import {
  ANNUAL_CALENDAR_TEMPLATES,
  calendarDateInZone,
  localNoonInZone,
} from "@vineyard/shared";
import { buildFixedCalendarTasks } from "../src/modules/seasons/seasons.service.js";

test("D4/G2: localNoonInZone preserves calendar date in America/Chicago and Pacific/Auckland near New Year", () => {
  const zones = ["America/Chicago", "Pacific/Auckland"] as const;
  const dates = ["2026-12-31", "2027-01-01", "2027-03-08", "2027-07-15", "2027-11-10"];

  for (const tz of zones) {
    for (const iso of dates) {
      const instant = localNoonInZone(iso, tz);
      assert.equal(
        calendarDateInZone(instant, tz),
        iso,
        `expected ${iso} in ${tz}, got ${calendarDateInZone(instant, tz)}`,
      );
      const localHour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "2-digit",
          hour12: false,
        }).format(instant),
      );
      assert.equal(localHour, 12, `expected local noon (12) in ${tz} for ${iso}`);
    }
  }
});

test("D1: buildFixedCalendarTasks puts Dormant Pruning first with unique stable template keys", () => {
  const tasks = buildFixedCalendarTasks(2027);
  assert.equal(tasks.length, ANNUAL_CALENDAR_TEMPLATES.length);
  assert.equal(tasks[0]?.templateKey, "dormant_prune");
  assert.equal(tasks[0]?.stage, "dormant");
  assert.equal(tasks[0]?.dueDate, "2027-03-08");
  assert.equal(tasks[0]?.checked, true);
  assert.equal(tasks[0]?.source, "Fixed calendar fallback");

  const keys = new Set(tasks.map((t) => t.templateKey));
  assert.equal(keys.size, tasks.length, "template keys must be unique");
  for (const task of tasks) {
    assert.ok(task.dueDate.startsWith("2027-"), "all dates must be in season year");
  }
});
