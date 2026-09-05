-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'INSTRUCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('FEATURE_DEVELOPER', 'TEST_DEVELOPER', 'CODE_REVIEWER');

-- CreateEnum
CREATE TYPE "MissionType" AS ENUM ('INDIVIDUAL', 'TEAM');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'TIMED_OUT', 'RESET');

-- CreateEnum
CREATE TYPE "SandboxStatus" AS ENUM ('CREATED', 'RUNNING', 'STOPPED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "GitEventType" AS ENUM ('ISSUE', 'BRANCH', 'COMMIT', 'PUSH', 'PULL_REQUEST', 'REVIEW', 'APPROVAL', 'CHANGES_REQUESTED', 'TEST', 'MERGE', 'CONFLICT_RESOLUTION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "department" TEXT,
    "semester" TEXT,
    "designation" TEXT,
    "role" "UserRole" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamRole" "TeamRole",
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "missionType" "MissionType" NOT NULL,
    "level" INTEGER NOT NULL,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "estimatedMinutes" INTEGER,
    "instructions" JSONB NOT NULL,
    "validationRules" JSONB NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "missionTemplateId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdById" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionRun" (
    "id" TEXT NOT NULL,
    "missionTemplateId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "userId" TEXT,
    "teamId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "repositoryUrl" TEXT,
    "giteaRepositoryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxSession" (
    "id" TEXT NOT NULL,
    "missionRunId" TEXT NOT NULL,
    "containerId" TEXT,
    "status" "SandboxStatus" NOT NULL DEFAULT 'CREATED',
    "workspaceKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitEvent" (
    "id" TEXT NOT NULL,
    "missionRunId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" "GitEventType" NOT NULL,
    "giteaEventId" TEXT,
    "giteaResourceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResult" (
    "id" TEXT NOT NULL,
    "missionRunId" TEXT NOT NULL,
    "individualScore" INTEGER,
    "teamScore" INTEGER,
    "totalScore" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "ruleResults" JSONB NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "missionRunId" TEXT NOT NULL,
    "userId" TEXT,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'bn',
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_universityId_key" ON "User"("universityId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "Team_createdAt_idx" ON "Team"("createdAt");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MissionTemplate_slug_key" ON "MissionTemplate"("slug");

-- CreateIndex
CREATE INDEX "MissionTemplate_missionType_level_idx" ON "MissionTemplate"("missionType", "level");

-- CreateIndex
CREATE INDEX "MissionTemplate_isPublished_idx" ON "MissionTemplate"("isPublished");

-- CreateIndex
CREATE INDEX "Assignment_teamId_idx" ON "Assignment"("teamId");

-- CreateIndex
CREATE INDEX "Assignment_createdById_idx" ON "Assignment"("createdById");

-- CreateIndex
CREATE INDEX "Assignment_status_idx" ON "Assignment"("status");

-- CreateIndex
CREATE INDEX "MissionRun_userId_status_idx" ON "MissionRun"("userId", "status");

-- CreateIndex
CREATE INDEX "MissionRun_teamId_status_idx" ON "MissionRun"("teamId", "status");

-- CreateIndex
CREATE INDEX "MissionRun_assignmentId_idx" ON "MissionRun"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxSession_containerId_key" ON "SandboxSession"("containerId");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxSession_workspaceKey_key" ON "SandboxSession"("workspaceKey");

-- CreateIndex
CREATE INDEX "SandboxSession_missionRunId_status_idx" ON "SandboxSession"("missionRunId", "status");

-- CreateIndex
CREATE INDEX "GitEvent_missionRunId_eventType_idx" ON "GitEvent"("missionRunId", "eventType");

-- CreateIndex
CREATE INDEX "GitEvent_actorUserId_idx" ON "GitEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "GitEvent_occurredAt_idx" ON "GitEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "GitEvent_giteaEventId_key" ON "GitEvent"("giteaEventId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentResult_missionRunId_key" ON "AssessmentResult"("missionRunId");

-- CreateIndex
CREATE INDEX "Feedback_missionRunId_idx" ON "Feedback"("missionRunId");

-- CreateIndex
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_missionTemplateId_fkey" FOREIGN KEY ("missionTemplateId") REFERENCES "MissionTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionRun" ADD CONSTRAINT "MissionRun_missionTemplateId_fkey" FOREIGN KEY ("missionTemplateId") REFERENCES "MissionTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionRun" ADD CONSTRAINT "MissionRun_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionRun" ADD CONSTRAINT "MissionRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionRun" ADD CONSTRAINT "MissionRun_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxSession" ADD CONSTRAINT "SandboxSession_missionRunId_fkey" FOREIGN KEY ("missionRunId") REFERENCES "MissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitEvent" ADD CONSTRAINT "GitEvent_missionRunId_fkey" FOREIGN KEY ("missionRunId") REFERENCES "MissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitEvent" ADD CONSTRAINT "GitEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_missionRunId_fkey" FOREIGN KEY ("missionRunId") REFERENCES "MissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_missionRunId_fkey" FOREIGN KEY ("missionRunId") REFERENCES "MissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
