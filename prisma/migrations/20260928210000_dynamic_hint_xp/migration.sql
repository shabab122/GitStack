-- Preserve legacy attempts that already paid for hints immediately. New
-- individual attempts snapshot their XP reward and settle hints on completion.
ALTER TABLE "MissionRun" ADD COLUMN "hintRewardXp" INTEGER;
