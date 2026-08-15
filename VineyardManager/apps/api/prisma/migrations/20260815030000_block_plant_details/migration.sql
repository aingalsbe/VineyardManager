-- CreateEnum
CREATE TYPE "BlockStatus" AS ENUM ('active', 'fallow', 'replanting', 'retired');

-- AlterTable
ALTER TABLE "blocks"
ADD COLUMN "variety" TEXT NOT NULL DEFAULT 'Unknown',
ADD COLUMN "acreage" DECIMAL(6,2) NOT NULL DEFAULT 0,
ADD COLUMN "planted_year" INTEGER NOT NULL DEFAULT 2020,
ADD COLUMN "status" "BlockStatus" NOT NULL DEFAULT 'active';

ALTER TABLE "blocks" ALTER COLUMN "variety" DROP DEFAULT;
ALTER TABLE "blocks" ALTER COLUMN "acreage" DROP DEFAULT;
ALTER TABLE "blocks" ALTER COLUMN "planted_year" DROP DEFAULT;
