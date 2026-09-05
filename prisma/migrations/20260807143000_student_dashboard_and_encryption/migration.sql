-- Student dashboard, mission progress and encrypted-lookup support.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailLookupHash" TEXT,
  ADD COLUMN IF NOT EXISTS "universityIdLookupHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_emailLookupHash_key"
  ON "User"("emailLookupHash");
CREATE UNIQUE INDEX IF NOT EXISTS "User_universityIdLookupHash_key"
  ON "User"("universityIdLookupHash");

ALTER TABLE "MissionRun"
  ADD COLUMN IF NOT EXISTS "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "submissionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "resetCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "xpAwarded" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastSubmittedAt" TIMESTAMP(3);
