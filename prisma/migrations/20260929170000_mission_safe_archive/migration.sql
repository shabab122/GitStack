-- Keep assigned and assessed mission records intact when instructors remove
-- completed custom missions from their catalog.
ALTER TABLE "MissionTemplate" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
