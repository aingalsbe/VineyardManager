-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('power_user', 'manager', 'viewer');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('maintenance', 'weather', 'health_summary');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'sent', 'acknowledged', 'dismissed');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('pruning', 'watering', 'fertilization', 'pest_prevention', 'weed_prevention', 'harvest', 'health_observation', 'vine_replacement', 'winterization', 'other');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "notification_prefs" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vineyards" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "timezone" TEXT NOT NULL,
    "health_thresholds" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "vineyards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" UUID NOT NULL,
    "vineyard_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "vineyard_id" UUID NOT NULL,
    "block_id" UUID,
    "user_id" UUID,
    "type" "TaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "related_activity_type" "ActivityType",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "vineyards_owner_id_idx" ON "vineyards"("owner_id");

-- CreateIndex
CREATE INDEX "blocks_vineyard_id_idx" ON "blocks"("vineyard_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_vineyard_id_code_key" ON "blocks"("vineyard_id", "code");

-- CreateIndex
CREATE INDEX "tasks_vineyard_id_due_at_idx" ON "tasks"("vineyard_id", "due_at");

-- CreateIndex
CREATE INDEX "tasks_user_id_status_idx" ON "tasks"("user_id", "status");

-- CreateIndex
CREATE INDEX "tasks_block_id_idx" ON "tasks"("block_id");

-- AddForeignKey
ALTER TABLE "vineyards" ADD CONSTRAINT "vineyards_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_vineyard_id_fkey" FOREIGN KEY ("vineyard_id") REFERENCES "vineyards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_vineyard_id_fkey" FOREIGN KEY ("vineyard_id") REFERENCES "vineyards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
