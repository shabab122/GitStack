import { UserRole } from "@prisma/client";

export const MILESTONE_BADGES = Object.freeze({
  1: { key: "DIAMOND", label: "Diamond", icon: "gem" },
  2: { key: "PLATINUM", label: "Platinum", icon: "award" },
  3: { key: "GOLD", label: "Gold", icon: "medal" },
  4: { key: "SILVER", label: "Silver", icon: "medal" },
  5: { key: "BRONZE", label: "Bronze", icon: "medal" }
});

export function milestoneForRank(rank) {
  return MILESTONE_BADGES[rank] || null;
}

function uniqueCompletedRuns(runs) {
  return new Set(
    runs
      .filter((run) => run.status === "COMPLETED")
      .map((run) => run.missionTemplateId)
  ).size;
}

function performanceRow(user) {
  const runs = user.missionRuns || [];
  const completedMissions = uniqueCompletedRuns(runs);
  const passedAssessments = runs.filter((run) => run.assessmentResult?.passed).length;
  const attempts = runs.length;
  const inProgressMissions = runs.filter((run) => run.status === "IN_PROGRESS").length;

  // Transparent activity score: rewards completion most, then verified passes,
  // then bounded participation. XP is intentionally not the primary input so
  // "Top contributors" is meaningfully different from the XP leaderboard.
  const contributionScore =
    completedMissions * 20 +
    passedAssessments * 10 +
    Math.min(attempts, 25) * 2 +
    inProgressMissions * 2;

  return {
    id: user.id,
    xp: user.xp,
    completedMissions,
    passedAssessments,
    attempts,
    inProgressMissions,
    contributionScore,
    fullNameEncrypted: user.fullName,
    universityIdEncrypted: user.universityId,
    departmentEncrypted: user.department,
    semesterEncrypted: user.semester,
    createdAt: user.createdAt
  };
}

export async function buildStudentLeaderboards(prisma) {
  const users = await prisma.user.findMany({
    where: { role: UserRole.STUDENT, isActive: true },
    orderBy: { createdAt: "asc" },
    include: {
      missionRuns: {
        select: {
          missionTemplateId: true,
          status: true,
          assessmentResult: { select: { passed: true } }
        }
      }
    }
  });

  const rows = users.map(performanceRow);

  const xpLeaderboard = [...rows]
    .sort((a, b) =>
      b.xp - a.xp ||
      b.completedMissions - a.completedMissions ||
      b.passedAssessments - a.passedAssessments ||
      new Date(a.createdAt) - new Date(b.createdAt)
    )
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      milestone: milestoneForRank(index + 1)
    }));

  const contributorLeaderboard = [...rows]
    .sort((a, b) =>
      b.contributionScore - a.contributionScore ||
      b.completedMissions - a.completedMissions ||
      b.xp - a.xp ||
      new Date(a.createdAt) - new Date(b.createdAt)
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return { xpLeaderboard, contributorLeaderboard };
}
