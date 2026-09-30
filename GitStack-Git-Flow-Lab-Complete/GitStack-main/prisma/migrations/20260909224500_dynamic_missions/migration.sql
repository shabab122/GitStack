-- GitStack v15 enhancement: instructor-owned dynamic mission templates.
ALTER TABLE "MissionTemplate"
  ADD COLUMN IF NOT EXISTS "createdById" TEXT;

CREATE INDEX IF NOT EXISTS "MissionTemplate_createdById_idx"
  ON "MissionTemplate"("createdById");

DO $$ BEGIN
  ALTER TABLE "MissionTemplate"
    ADD CONSTRAINT "MissionTemplate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
