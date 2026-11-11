-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('legacy', 'active', 'planned', 'closed');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "season_id" UUID;

-- AlterTable
ALTER TABLE "harvests" ADD COLUMN     "season_id" UUID;

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "season_id" UUID;

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "vineyard_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "SeasonStatus" NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seasons_vineyard_id_year_key" ON "seasons"("vineyard_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_id_vineyard_id_key" ON "seasons"("id", "vineyard_id");

-- CreateIndex
CREATE INDEX "tasks_vineyard_id_season_id_idx" ON "tasks"("vineyard_id", "season_id");

-- CreateIndex
CREATE INDEX "harvests_vineyard_id_season_id_idx" ON "harvests"("vineyard_id", "season_id");

-- CreateIndex
CREATE INDEX "activities_vineyard_id_season_id_idx" ON "activities"("vineyard_id", "season_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_season_id_vineyard_id_fkey" FOREIGN KEY ("season_id", "vineyard_id") REFERENCES "seasons"("id", "vineyard_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_season_id_vineyard_id_fkey" FOREIGN KEY ("season_id", "vineyard_id") REFERENCES "seasons"("id", "vineyard_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_season_id_vineyard_id_fkey" FOREIGN KEY ("season_id", "vineyard_id") REFERENCES "seasons"("id", "vineyard_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_vineyard_id_fkey" FOREIGN KEY ("vineyard_id") REFERENCES "vineyards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: at most one active and one planned season per vineyard.
CREATE UNIQUE INDEX "seasons_one_active_per_vineyard" ON "seasons"("vineyard_id") WHERE "status" = 'active';
CREATE UNIQUE INDEX "seasons_one_planned_per_vineyard" ON "seasons"("vineyard_id") WHERE "status" = 'planned';
