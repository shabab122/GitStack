-- Gitea organization/team ownership and optional GitStack-to-Gitea username mapping.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "giteaUsername" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "giteaTeamId" INTEGER;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "giteaTeamName" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_giteaUsername_key"
  ON "User"("giteaUsername") WHERE "giteaUsername" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Team_giteaTeamId_key"
  ON "Team"("giteaTeamId") WHERE "giteaTeamId" IS NOT NULL;
