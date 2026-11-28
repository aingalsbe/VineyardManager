import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPreDeleteCode,
  formatBackfill26Line,
  parseBackfill26Args,
  sanitizeBackfill26Error,
} from "../scripts/backfill-seasons-2-6.js";

test("backfill-seasons-2-6 CLI args default to dry-run and require --database-url-env for --apply", () => {
  assert.deepEqual(parseBackfill26Args([]), {
    apply: false,
    databaseUrlEnv: null,
  });
  assert.throws(
    () => parseBackfill26Args(["--apply"]),
    /--apply requires --database-url-env <NAME>/,
  );
  assert.deepEqual(
    parseBackfill26Args(["--apply", "--database-url-env", "MY_DB_URL"]),
    { apply: true, databaseUrlEnv: "MY_DB_URL" },
  );
});

test("backfill-seasons-2-6 formats count-only lines, extracts preDeleteCode, and redacts raw driver errors", () => {
  assert.equal(
    formatBackfill26Line({
      vineyardOrdinal: 1,
      table: "tasks",
      reason: "set_template_key",
      count: 4,
    }),
    "vineyard=1 table=tasks reason=set_template_key count=4",
  );

  assert.equal(
    extractPreDeleteCode("12345678-aaaa-bbbb-cccc-1234567890ab", "L1__old_12345678"),
    "L1",
  );
  assert.equal(
    extractPreDeleteCode("12345678-aaaa-bbbb-cccc-1234567890ab", "L1__old_deadbeef"),
    null,
  );

  const sanitized = sanitizeBackfill26Error(
    Object.assign(
      new Error("postgresql://secret:pass@db/prod failed for user@example.test"),
      { code: "P2002", table: "tasks" },
    ),
  );
  assert.equal(sanitized, "code=P2002 table=tasks");
  assert.equal(sanitized.includes("postgresql://"), false);
  assert.equal(sanitized.includes("secret"), false);
});
