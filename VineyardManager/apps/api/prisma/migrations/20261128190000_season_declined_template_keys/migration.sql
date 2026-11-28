-- Additive only: records calendar tasks the user unchecked when starting a season,
-- so "Add missing calendar tasks" does not re-add them (QA defect D-A).
ALTER TABLE "seasons" ADD COLUMN "declined_template_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
