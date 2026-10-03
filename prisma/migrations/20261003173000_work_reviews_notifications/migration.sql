-- CreateEnum
CREATE TYPE "WorkReviewStatus" AS ENUM ('PENDING', 'REVIEWED', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "WorkReviewRequest" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "teamId" TEXT,
    "assignmentId" TEXT,
    "studentId" TEXT,
    "instructorId" TEXT,
    "teamName" TEXT NOT NULL,
    "repositoryOwner" TEXT NOT NULL,
    "repositoryName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "headSha" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" "WorkReviewStatus" NOT NULL DEFAULT 'PENDING',
    "feedback" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "url" TEXT NOT NULL,
    "reviewRequestId" TEXT,
    "assignmentId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkReviewRequest_requestKey_key" ON "WorkReviewRequest"("requestKey");

-- CreateIndex
CREATE INDEX "WorkReviewRequest_studentId_createdAt_idx" ON "WorkReviewRequest"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkReviewRequest_instructorId_status_createdAt_idx" ON "WorkReviewRequest"("instructorId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardNotification_dedupeKey_key" ON "DashboardNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "DashboardNotification_userId_readAt_createdAt_idx" ON "DashboardNotification"("userId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkReviewRequest" ADD CONSTRAINT "WorkReviewRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReviewRequest" ADD CONSTRAINT "WorkReviewRequest_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReviewRequest" ADD CONSTRAINT "WorkReviewRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReviewRequest" ADD CONSTRAINT "WorkReviewRequest_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardNotification" ADD CONSTRAINT "DashboardNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardNotification" ADD CONSTRAINT "DashboardNotification_reviewRequestId_fkey" FOREIGN KEY ("reviewRequestId") REFERENCES "WorkReviewRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardNotification" ADD CONSTRAINT "DashboardNotification_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

