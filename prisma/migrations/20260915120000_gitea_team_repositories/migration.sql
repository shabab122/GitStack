-- GitStack Gitea repository management for collaboration teams.
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "giteaOwner" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "giteaRepository" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "giteaRepositoryId" INTEGER;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "giteaRepositoryUrl" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "giteaProvisionedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Team_giteaRepositoryId_key"
  ON "Team"("giteaRepositoryId") WHERE "giteaRepositoryId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Team_giteaRepository_idx"
  ON "Team"("giteaRepository");
