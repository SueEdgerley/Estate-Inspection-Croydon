-- Optional marker for how the inspection was created (e.g. ad_hoc)
ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "source" VARCHAR(50);
