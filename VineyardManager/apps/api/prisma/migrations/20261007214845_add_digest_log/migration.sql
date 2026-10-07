-- CreateEnum
CREATE TYPE "DigestKind" AS ENUM ('scheduled', 'test');

-- CreateEnum
CREATE TYPE "DigestStatus" AS ENUM ('sent', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "digest_logs" (
    "id" UUID NOT NULL,
    "vineyard_id" UUID NOT NULL,
    "user_id" UUID,
    "recipient_email" TEXT NOT NULL,
    "week_start" DATE NOT NULL,
    "kind" "DigestKind" NOT NULL,
    "status" "DigestStatus" NOT NULL,
    "error" TEXT,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "digest_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "digest_logs_vineyard_id_week_start_idx" ON "digest_logs"("vineyard_id", "week_start");

-- CreateIndex
CREATE INDEX "digest_logs_user_id_idx" ON "digest_logs"("user_id");

-- AddForeignKey
ALTER TABLE "digest_logs" ADD CONSTRAINT "digest_logs_vineyard_id_fkey" FOREIGN KEY ("vineyard_id") REFERENCES "vineyards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_logs" ADD CONSTRAINT "digest_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index (hand-written; Prisma 6 cannot express WHERE clauses).
-- At most one SCHEDULED digest row per (vineyard, user, week). Test sends are unlimited.
-- Scheduled rows always carry user_id (NULLs would not collide).
CREATE UNIQUE INDEX "digest_logs_scheduled_once" ON "digest_logs"("vineyard_id", "user_id", "week_start") WHERE "kind" = 'scheduled';
