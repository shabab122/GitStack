import { decryptUserValue } from "../security/user-data-crypto.js";

// Synchronize from existing active assignments instead of coupling their save,
// repository preparation or assessment to the notification service.
export async function syncAssignmentNotifications(prisma, user) {
  if (user.role !== "STUDENT") return;
  const assignments = await prisma.assignment.findMany({
    where: { status: "ACTIVE", OR: [{ studentId: user.id }, { team: { members: { some: { userId: user.id } } } }] },
    include: { missionTemplate: { select: { title: true, slug: true, missionType: true } }, createdBy: { select: { fullName: true } }, team: { select: { name: true } } }
  });
  if (!assignments.length) return;
  await prisma.dashboardNotification.createMany({ skipDuplicates: true, data: assignments.map((assignment) => ({
    userId: user.id, dedupeKey: `assignment:${assignment.id}:${user.id}`, kind: "ASSIGNMENT_ASSIGNED", title: assignment.missionTemplate.title,
    data: { actorName: decryptUserValue(assignment.createdBy.fullName), teamName: assignment.team?.name || null, missionType: assignment.missionTemplate.missionType,
      startsAt: assignment.startsAt?.toISOString() || null, dueAt: assignment.dueAt?.toISOString() || null },
    url: `student-dashboard.html?assignment=${assignment.id}#assignedMissions`,
    assignmentId: assignment.id, createdAt: assignment.createdAt
  })) });
}
export function notificationSummary(row) {
  return { id: row.id, kind: row.kind, title: row.title, data: row.data, url: row.url, readAt: row.readAt, createdAt: row.createdAt };
}
