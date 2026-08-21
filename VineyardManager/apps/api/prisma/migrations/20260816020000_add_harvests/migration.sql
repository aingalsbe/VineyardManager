-- CreateEnum
CREATE TYPE "YieldUnit" AS ENUM ('lb', 'kg', 'lug', 'bin', 'flat', 'bushel', 'other');

-- CreateTable
CREATE TABLE "harvests" (
    "id" UUID NOT NULL,
    "row_id" UUID NOT NULL,
    "vineyard_id" UUID NOT NULL,
    "harvested_at" TIMESTAMPTZ(6) NOT NULL,
    "yield_amount" DECIMAL(8,2) NOT NULL,
    "yield_unit" "YieldUnit" NOT NULL,
    "notes" TEXT,
    "crew" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "harvests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "harvests_row_id_harvested_at_idx" ON "harvests"("row_id", "harvested_at");

-- CreateIndex
CREATE INDEX "harvests_vineyard_id_harvested_at_idx" ON "harvests"("vineyard_id", "harvested_at");

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_row_id_fkey" FOREIGN KEY ("row_id") REFERENCES "rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_vineyard_id_fkey" FOREIGN KEY ("vineyard_id") REFERENCES "vineyards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
