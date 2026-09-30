-- Complete GitStack collaboration workflow metadata.
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "giteaWebhookId" INTEGER;

ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "collaborationPreparedAt" TIMESTAMP(3);
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "giteaIssueNumber" INTEGER;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "giteaIssueUrl" TEXT;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "collaborationState" JSONB;

ALTER TABLE "MissionRun" ADD COLUMN IF NOT EXISTS "teamRole" "TeamRole";

ALTER TABLE "GitEvent" ADD COLUMN IF NOT EXISTS "deliveryId" TEXT;
ALTER TABLE "GitEvent" ADD COLUMN IF NOT EXISTS "action" TEXT;
ALTER TABLE "GitEvent" ADD COLUMN IF NOT EXISTS "repositoryId" INTEGER;
ALTER TABLE "GitEvent" ADD COLUMN IF NOT EXISTS "branch" TEXT;
ALTER TABLE "GitEvent" ADD COLUMN IF NOT EXISTS "scoreValue" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "GitEvent_repositoryId_idx" ON "GitEvent"("repositoryId");
CREATE INDEX IF NOT EXISTS "GitEvent_deliveryId_idx" ON "GitEvent"("deliveryId");
CREATE INDEX IF NOT EXISTS "MissionRun_assignmentId_teamRole_idx" ON "MissionRun"("assignmentId", "teamRole");
