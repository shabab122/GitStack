-- Instructor dashboard: team ownership and direct student mission assignments.
ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "createdById" TEXT;

ALTER TABLE "Assignment"
  ADD COLUMN IF NOT EXISTS "studentId" TEXT;


-- Preserve ownership for legacy teams that already had an instructor-created assignment.
UPDATE "Team" AS team
SET "createdById" = assignment."createdById"
FROM "Assignment" AS assignment
WHERE assignment."teamId" = team."id"
  AND team."createdById" IS NULL;

CREATE INDEX IF NOT EXISTS "Team_createdById_idx"
  ON "Team"("createdById");
CREATE INDEX IF NOT EXISTS "Assignment_studentId_idx"
  ON "Assignment"("studentId");

DO $$ BEGIN
  ALTER TABLE "Team"
    ADD CONSTRAINT "Team_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Assignment"
    ADD CONSTRAINT "Assignment_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
