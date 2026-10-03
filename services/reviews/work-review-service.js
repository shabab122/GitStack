import { decryptUserValue } from "../security/user-data-crypto.js";
import { ReviewError } from "./review-error.js";
import { captureReviewEvidence } from "./gitea-review-evidence.js";

export const reviewInclude = {
  student: { select: { id: true, fullName: true, universityId: true } },
  instructor: { select: { id: true, fullName: true } },
  assignment: { select: { id: true, missionTemplate: { select: { title: true } } } }
};
export function reviewOwnerWhere(user) {
  return user.role === "STUDENT" ? { studentId: user.id } : { instructorId: user.id };
}
export function reviewSummary(row, detailed = false) {
  return {
    id: row.id, teamId: row.teamId, teamName: row.teamName,
    assignment: row.assignment ? { id: row.assignment.id, title: row.assignment.missionTemplate.title } : null,
    title: row.title, summary: row.summary, referenceType: row.referenceType,
    reference: row.reference, headSha: row.headSha,
    repository: `${row.repositoryOwner}/${row.repositoryName}`,
    student: row.student ? { id: row.student.id, fullName: decryptUserValue(row.student.fullName), universityId: decryptUserValue(row.student.universityId) } : null,
    instructor: row.instructor ? { id: row.instructor.id, fullName: decryptUserValue(row.instructor.fullName) } : null,
    status: row.status, feedback: row.feedback, reviewedAt: row.reviewedAt, createdAt: row.createdAt,
    ...(detailed ? { evidence: row.evidence } : {})
  };
}
async function studentReviewTeam(prisma, user, teamId) {
  const team = await prisma.team.findFirst({
    where: { id: teamId, members: { some: { userId: user.id } } },
    include: { createdBy: { select: { id: true, role: true, isActive: true } } }
  });
  if (!team) throw new ReviewError("Team not found or you are no longer a member.", 404);
  if (!team.createdBy?.isActive || !["INSTRUCTOR", "ADMIN"].includes(team.createdBy.role)) {
    throw new ReviewError("This team does not have an active instructor to receive work reviews.", 409);
  }
  if (!team.giteaOwner || !team.giteaRepository || !team.giteaRepositoryId) {
    throw new ReviewError("Your instructor must assign a Gitea repository before you can request a review.", 409);
  }
  return team;
}
export async function submitWorkReview({ prisma, user, input, evidenceClient }) {
  const requestKey = `${user.id}:${input.clientRequestId}`;
  const retry = await prisma.workReviewRequest.findUnique({ where: { requestKey }, include: reviewInclude });
  if (retry) return { review: reviewSummary(retry, true), reused: true };
  const team = await studentReviewTeam(prisma, user, input.teamId);
  const evidence = await captureReviewEvidence({ team, input, client: evidenceClient });
  return prisma.$transaction(async (tx) => {
    // Serialize submissions with membership edits and duplicate browser retries.
    await tx.$queryRawUnsafe('SELECT "id" FROM "Team" WHERE "id" = $1 FOR UPDATE', team.id);
    const current = await studentReviewTeam(tx, user, input.teamId);
    if (current.createdById !== team.createdById || current.giteaOwner !== team.giteaOwner || current.giteaRepository !== team.giteaRepository || current.giteaRepositoryId !== team.giteaRepositoryId) {
      throw new ReviewError("The team repository or instructor changed. Refresh and submit again.", 409);
    }
    if (input.assignmentId) {
      const assignment = await tx.assignment.findFirst({ where: { id: input.assignmentId, teamId: team.id, status: { in: ["ACTIVE", "CLOSED"] } } });
      if (!assignment) throw new ReviewError("Select an active or closed assignment belonging to this team.", 400);
    }
    const existing = await tx.workReviewRequest.findFirst({
      where: { OR: [{ requestKey }, { teamId: team.id, studentId: user.id, headSha: evidence.headSha, status: "PENDING" }] }, include: reviewInclude
    });
    if (existing) return { review: reviewSummary(existing, true), reused: true };
    const row = await tx.workReviewRequest.create({
      data: { requestKey, teamId: team.id, assignmentId: input.assignmentId || null, studentId: user.id, instructorId: team.createdById,
        teamName: team.name, repositoryOwner: team.giteaOwner, repositoryName: team.giteaRepository,
        title: input.title, summary: input.summary, referenceType: input.referenceType, reference: input.reference,
        headSha: evidence.headSha, evidence }, include: reviewInclude
    });
    await tx.dashboardNotification.create({ data: {
      userId: team.createdById, dedupeKey: `review:${row.id}:requested`, kind: "REVIEW_REQUESTED", title: row.title,
      data: { actorName: decryptUserValue(user.fullName), teamName: team.name },
      url: `instructor-reviews.html?request=${row.id}`, reviewRequestId: row.id
    } });
    return { review: reviewSummary(row, true), reused: false };
  });
}
export async function replyToWorkReview({ prisma, user, id, input }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "WorkReviewRequest" WHERE "id" = $1 FOR UPDATE', id);
    const row = await tx.workReviewRequest.findFirst({ where: { id, instructorId: user.id }, include: reviewInclude });
    if (!row) throw new ReviewError("Review request not found.", 404);
    if (row.status !== "PENDING") {
      if (row.status === input.status && row.feedback === input.feedback) return reviewSummary(row, true);
      throw new ReviewError("Feedback has already been sent for this request. The student can submit a new review after making changes.", 409);
    }
    const updated = await tx.workReviewRequest.update({ where: { id }, data: { status: input.status, feedback: input.feedback, reviewedAt: new Date() }, include: reviewInclude });
    if (row.studentId) await tx.dashboardNotification.create({ data: {
      userId: row.studentId, dedupeKey: `review:${id}:feedback`, kind: "REVIEW_FEEDBACK", title: row.title,
      data: { actorName: decryptUserValue(user.fullName), teamName: row.teamName, outcome: input.status },
      url: `student-reviews.html?request=${id}`, reviewRequestId: id
    } });
    await tx.dashboardNotification.updateMany({ where: { userId: user.id, reviewRequestId: id, kind: "REVIEW_REQUESTED", readAt: null }, data: { readAt: new Date() } });
    return reviewSummary(updated, true);
  });
}
