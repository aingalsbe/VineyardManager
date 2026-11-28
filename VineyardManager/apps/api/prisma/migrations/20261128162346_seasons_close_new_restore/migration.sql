-- CreateEnum
CREATE TYPE "SeasonSummaryMailStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- AlterTable
ALTER TABLE "rows" ADD COLUMN     "pre_delete_code" TEXT,
ADD COLUMN     "pre_delete_status" "RowStatus";

-- AlterTable
ALTER TABLE "seasons" ADD COLUMN     "close_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "closed_by" UUID,
ADD COLUMN     "reopened_at" TIMESTAMPTZ(6),
ADD COLUMN     "snapshot" JSONB,
ADD COLUMN     "started_by" UUID,
ADD COLUMN     "summary" JSONB,
ADD COLUMN     "summary_history" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "template_key" TEXT;

-- AlterTable
ALTER TABLE "vineyards" ADD COLUMN     "variety_harvest_tags" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "season_summary_mails" (
    "id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "vineyard_id" UUID NOT NULL,
    "close_version" INTEGER NOT NULL,
    "user_id" UUID,
    "recipient_email" TEXT NOT NULL,
    "status" "SeasonSummaryMailStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "season_summary_mails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "season_summary_mails_status_created_at_idx" ON "season_summary_mails"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "season_summary_mails_season_id_close_version_recipient_emai_key" ON "season_summary_mails"("season_id", "close_version", "recipient_email");

-- AddForeignKey
ALTER TABLE "season_summary_mails" ADD CONSTRAINT "season_summary_mails_season_id_vineyard_id_fkey" FOREIGN KEY ("season_id", "vineyard_id") REFERENCES "seasons"("id", "vineyard_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "season_summary_mails" ADD CONSTRAINT "season_summary_mails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written: at most one live task per (season_id, template_key) for calendar deduplication.
CREATE UNIQUE INDEX "tasks_season_template_key_live_unique"
  ON "tasks"("season_id", "template_key")
  WHERE "template_key" IS NOT NULL AND "deleted_at" IS NULL;

