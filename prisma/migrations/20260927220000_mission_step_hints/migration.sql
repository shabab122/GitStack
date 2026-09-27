-- Keep instructor answers outside student-visible mission instructions.
ALTER TABLE "MissionTemplate" ADD COLUMN "stepHints" JSONB;

-- One paid unlock per step per attempt. Existing attempts begin with no charges.
CREATE TABLE "MissionHintUse" (
    "id" TEXT NOT NULL,
    "missionRunId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "costXp" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MissionHintUse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MissionHintUse_missionRunId_stepIndex_key"
    ON "MissionHintUse"("missionRunId", "stepIndex");

ALTER TABLE "MissionHintUse" ADD CONSTRAINT "MissionHintUse_missionRunId_fkey"
    FOREIGN KEY ("missionRunId") REFERENCES "MissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
