-- Blocks become rows: length in feet/inches, vine count, rename FKs.

ALTER TYPE "BlockStatus" RENAME TO "RowStatus";

ALTER TABLE "blocks" RENAME TO "rows";

ALTER TABLE "rows" DROP COLUMN "acreage";

ALTER TABLE "rows"
ADD COLUMN "length_feet" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "length_inches" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "vine_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "rows" ALTER COLUMN "length_feet" DROP DEFAULT;
ALTER TABLE "rows" ALTER COLUMN "length_inches" DROP DEFAULT;
ALTER TABLE "rows" ALTER COLUMN "vine_count" DROP DEFAULT;

ALTER TABLE "rows" ADD CONSTRAINT "rows_length_inches_check" CHECK ("length_inches" >= 0 AND "length_inches" < 12);
ALTER TABLE "rows" ADD CONSTRAINT "rows_vine_count_check" CHECK ("vine_count" >= 0);

ALTER TABLE "rows" RENAME CONSTRAINT "blocks_pkey" TO "rows_pkey";
ALTER TABLE "rows" RENAME CONSTRAINT "blocks_vineyard_id_fkey" TO "rows_vineyard_id_fkey";
ALTER INDEX "blocks_vineyard_id_idx" RENAME TO "rows_vineyard_id_idx";
ALTER INDEX "blocks_vineyard_id_code_key" RENAME TO "rows_vineyard_id_code_key";

ALTER TABLE "tasks" DROP CONSTRAINT "tasks_block_id_fkey";
ALTER INDEX "tasks_block_id_idx" RENAME TO "tasks_row_id_idx";
ALTER TABLE "tasks" RENAME COLUMN "block_id" TO "row_id";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_row_id_fkey" FOREIGN KEY ("row_id") REFERENCES "rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
