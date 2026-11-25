-- Add server-side JWT revocation counter on users (strictly additive, default 0).
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- Replace non-unique password_resets(token_hash) index with a UNIQUE index.
DROP INDEX IF EXISTS "password_resets_token_hash_idx";
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- Hand-written partial indexes for live (non-deleted) task and activity queries.
-- Note: Prisma 6 cannot express WHERE clauses on indexes. Preserve these (alongside
-- digest_logs_scheduled_once and seasons_one_*_per_vineyard) in any future migration.
CREATE INDEX "tasks_vineyard_status_due_live_idx"
  ON "tasks"("vineyard_id", "status", "due_at")
  WHERE "deleted_at" IS NULL;

CREATE INDEX "activities_vineyard_type_perf_live_idx"
  ON "activities"("vineyard_id", "activity_type", "performed_at" DESC)
  WHERE "deleted_at" IS NULL;
