import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeNotificationPrefs,
  updateActivitySchema,
  wantsWeeklyDigest,
} from "@vineyard/shared";
import { deriveRestoreRowCode } from "../src/modules/rows/row-delete.js";

test("mergeNotificationPrefs preserves unknown keys and applies defaults", () => {
  const merged = mergeNotificationPrefs(
    { customFutureFlag: "keep-me", weeklyDigest: true },
    { weeklyDigest: false },
  );
  assert.equal(merged.weeklyDigest, false);
  assert.equal(merged.emailEnabled, true);
  assert.equal(merged.customFutureFlag, "keep-me");
});

test("wantsWeeklyDigest respects weeklyDigest switch and emailEnabled master flag", () => {
  assert.equal(wantsWeeklyDigest(null), true);
  assert.equal(wantsWeeklyDigest({}), true);
  assert.equal(wantsWeeklyDigest({ weeklyDigest: false }), false);
  assert.equal(wantsWeeklyDigest({ emailEnabled: false, weeklyDigest: true }), false);
  assert.equal(wantsWeeklyDigest({ emailEnabled: true, weeklyDigest: true }), true);
});

test("deriveRestoreRowCode uses preDeleteCode first, then strips __old_<id8>", () => {
  assert.equal(
    deriveRestoreRowCode({
      id: "12345678-aaaa-bbbb-cccc-1234567890ab",
      code: "l1__old_12345678",
      preDeleteCode: "L1",
    }),
    "L1",
  );
  assert.equal(
    deriveRestoreRowCode({
      id: "abcdef12-aaaa-bbbb-cccc-1234567890ab",
      code: "S3__old_abcdef12",
      preDeleteCode: null,
    }),
    "S3",
  );
  assert.equal(
    deriveRestoreRowCode({
      id: "99999999-aaaa-bbbb-cccc-1234567890ab",
      code: "N2__old_deadbeef",
      preDeleteCode: null,
    }),
    "N2",
  );
});

test("updateActivitySchema allows editable fields, requires at least one, and strips source", () => {
  const empty = updateActivitySchema.safeParse({});
  assert.equal(empty.success, false);

  const valid = updateActivitySchema.safeParse({
    activityType: "pruning",
    performedAt: "2026-05-15",
    details: { notes: "Edited note" },
    source: "weather",
  });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.equal(valid.data.activityType, "pruning");
    assert.equal("source" in valid.data, false);
  }
});
