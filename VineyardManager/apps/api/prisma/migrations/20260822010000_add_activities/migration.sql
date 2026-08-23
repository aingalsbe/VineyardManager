-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "vineyard_id" UUID NOT NULL,
    "row_id" UUID,
    "scope_type" TEXT NOT NULL,
    "scope_id" UUID NOT NULL,
    "activity_type" "ActivityType" NOT NULL,
    "performed_at" TIMESTAMPTZ(6) NOT NULL,
    "performed_by" UUID,
    "details" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_vineyard_id_performed_at_idx" ON "activities"("vineyard_id", "performed_at");

-- CreateIndex
CREATE INDEX "activities_row_id_idx" ON "activities"("row_id");

-- CreateIndex
CREATE INDEX "activities_activity_type_idx" ON "activities"("activity_type");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_vineyard_id_fkey" FOREIGN KEY ("vineyard_id") REFERENCES "vineyards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_row_id_fkey" FOREIGN KEY ("row_id") REFERENCES "rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
