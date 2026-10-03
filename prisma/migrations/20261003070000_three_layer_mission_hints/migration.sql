-- Existing hints already revealed a full command and paid the whole step cost.
-- Keep them fully unlocked; new purchases explicitly start at level 1.
ALTER TABLE "MissionHintUse" ADD COLUMN "hintLevel" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "MissionHintUse" ADD CONSTRAINT "MissionHintUse_hintLevel_check"
  CHECK ("hintLevel" BETWEEN 1 AND 3);
