-- Complete Docker sandbox persistence and lifecycle support.
ALTER TYPE "SandboxStatus" ADD VALUE IF NOT EXISTS 'DELETED';

DO $$ BEGIN
  CREATE TYPE "SandboxMode" AS ENUM ('ISOLATED', 'COLLABORATION');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "SandboxSession"
  ALTER COLUMN "missionRunId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "sandboxId" TEXT,
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "containerName" TEXT,
  ADD COLUMN IF NOT EXISTS "mode" "SandboxMode" NOT NULL DEFAULT 'ISOLATED',
  ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

UPDATE "SandboxSession"
SET "sandboxId" = "workspaceKey"
WHERE "sandboxId" IS NULL;

UPDATE "SandboxSession" AS session
SET "userId" = run."userId"
FROM "MissionRun" AS run
WHERE session."missionRunId" = run."id"
  AND session."userId" IS NULL;

ALTER TABLE "SandboxSession"
  ALTER COLUMN "sandboxId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "SandboxSession_sandboxId_key"
  ON "SandboxSession"("sandboxId");
CREATE UNIQUE INDEX IF NOT EXISTS "SandboxSession_containerName_key"
  ON "SandboxSession"("containerName");
CREATE INDEX IF NOT EXISTS "SandboxSession_userId_status_idx"
  ON "SandboxSession"("userId", "status");
CREATE INDEX IF NOT EXISTS "SandboxSession_expiresAt_status_idx"
  ON "SandboxSession"("expiresAt", "status");

DO $$ BEGIN
  ALTER TABLE "SandboxSession"
    ADD CONSTRAINT "SandboxSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "SandboxSession"
  DROP CONSTRAINT IF EXISTS "SandboxSession_missionRunId_fkey";

ALTER TABLE "SandboxSession"
  ADD CONSTRAINT "SandboxSession_missionRunId_fkey"
  FOREIGN KEY ("missionRunId") REFERENCES "MissionRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
