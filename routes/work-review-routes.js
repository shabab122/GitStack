import express from "express";
import { z } from "zod";
import { decryptUserValue } from "../services/security/user-data-crypto.js";
import { ReviewError } from "../services/reviews/review-error.js";
import { reviewInclude, reviewOwnerWhere, reviewSummary, submitWorkReview, replyToWorkReview } from "../services/reviews/work-review-service.js";
import { notificationSummary, syncAssignmentNotifications } from "../services/reviews/notification-service.js";

const idSchema = z.string().uuid();
const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(40).default(20), cursor: idSchema.optional(),
  status: z.enum(["ALL", "PENDING", "REVIEWED", "APPROVED", "CHANGES_REQUESTED"]).default("ALL")
});
const requestSchema = z.object({
  clientRequestId: idSchema, teamId: idSchema, assignmentId: idSchema.nullable().optional(),
  title: z.string().trim().min(3).max(120), summary: z.string().trim().min(10).max(3000),
  referenceType: z.enum(["BRANCH", "COMMIT", "PULL_REQUEST"]), reference: z.string().trim().min(1).max(180),
  files: z.array(z.string().trim().min(1).max(240).refine((name) => !name.startsWith("/") && !name.split("/").includes("..") && !/[\x00-\x1f]/.test(name), "Use a repository-relative file path.")).max(20).default([])
}).strict();
const feedbackSchema = z.object({
  status: z.enum(["REVIEWED", "APPROVED", "CHANGES_REQUESTED"]), feedback: z.string().trim().min(3).max(4000)
}).strict();
function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ error: "You do not have access to this action." });
}
function reviewErrors(error, _req, res, next) {
  if (error instanceof ReviewError) return res.status(error.statusCode).json({ error: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ error: "Check the required fields and their lengths.", fields: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
  next(error);
}
export function createWorkReviewRouter({ requireAuth, prisma, evidenceClient }) {
  const router = express.Router();
  router.use(requireAuth, requireRole("STUDENT", "INSTRUCTOR", "ADMIN"));
  router.get("/contexts", requireRole("STUDENT"), async (req, res, next) => {
    try {
      const teams = await prisma.team.findMany({
        where: { members: { some: { userId: req.user.id } }, createdBy: { role: { in: ["INSTRUCTOR", "ADMIN"] }, isActive: true },
          giteaOwner: { not: null }, giteaRepository: { not: null }, giteaRepositoryId: { not: null } },
        include: { createdBy: { select: { fullName: true } }, assignments: { where: { status: { in: ["ACTIVE", "CLOSED"] } },
          include: { missionTemplate: { select: { title: true } } }, orderBy: { createdAt: "desc" } } }, orderBy: { name: "asc" }
      });
      res.json({ teams: teams.map((team) => ({ id: team.id, name: team.name, repository: `${team.giteaOwner}/${team.giteaRepository}`,
        instructor: decryptUserValue(team.createdBy.fullName), assignments: team.assignments.map((assignment) => ({ id: assignment.id, title: assignment.missionTemplate.title })) })) });
    } catch (error) { next(error); }
  });
  router.get("/requests", async (req, res, next) => {
    try {
      const input = listSchema.parse(req.query);
      const owner = reviewOwnerWhere(req.user);
      const where = { ...owner, ...(input.status !== "ALL" ? { status: input.status } : {}) };
      if (input.cursor && !await prisma.workReviewRequest.findFirst({ where: { id: input.cursor, ...where }, select: { id: true } })) {
        throw new ReviewError("Review cursor not found.", 404);
      }
      const [rows, total, pending] = await Promise.all([
        prisma.workReviewRequest.findMany({ where, include: reviewInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: input.limit + 1,
          ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}) }),
        prisma.workReviewRequest.count({ where: owner }), prisma.workReviewRequest.count({ where: { ...owner, status: "PENDING" } })
      ]);
      res.json({ requests: rows.slice(0, input.limit).map((row) => reviewSummary(row)), total, pending,
        nextCursor: rows.length > input.limit ? rows[input.limit - 1].id : null });
    } catch (error) { next(error); }
  });
  router.get("/requests/:id", async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const row = await prisma.workReviewRequest.findFirst({ where: { id, ...reviewOwnerWhere(req.user) }, include: reviewInclude });
      if (!row) throw new ReviewError("Review request not found.", 404);
      res.json({ review: reviewSummary(row, true) });
    } catch (error) { next(error); }
  });
  router.post("/requests", requireRole("STUDENT"), async (req, res, next) => {
    try {
      const result = await submitWorkReview({ prisma, user: req.user, input: requestSchema.parse(req.body), evidenceClient });
      res.status(result.reused ? 200 : 201).json(result);
    } catch (error) { next(error); }
  });
  router.post("/requests/:id/seen", async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      if (!await prisma.workReviewRequest.findFirst({ where: { id, ...reviewOwnerWhere(req.user) }, select: { id: true } })) throw new ReviewError("Review request not found.", 404);
      await prisma.dashboardNotification.updateMany({ where: { reviewRequestId: id, userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
      res.json({ read: true });
    } catch (error) { next(error); }
  });
  router.post("/requests/:id/feedback", requireRole("INSTRUCTOR", "ADMIN"), async (req, res, next) => {
    try {
      const review = await replyToWorkReview({ prisma, user: req.user, id: idSchema.parse(req.params.id), input: feedbackSchema.parse(req.body) });
      res.json({ review });
    } catch (error) { next(error); }
  });
  router.use(reviewErrors);
  return router;
}
export function createDashboardNotificationRouter({ requireAuth, prisma }) {
  const router = express.Router();
  router.use(requireAuth, requireRole("STUDENT", "INSTRUCTOR", "ADMIN"));
  router.get("/", async (req, res, next) => {
    try {
      const { limit, cursor } = listSchema.parse(req.query);
      await syncAssignmentNotifications(prisma, req.user);
      const where = { userId: req.user.id };
      if (cursor && !await prisma.dashboardNotification.findFirst({ where: { id: cursor, ...where }, select: { id: true } })) throw new ReviewError("Notification cursor not found.", 404);
      const [rows, unreadCount] = await Promise.all([
        prisma.dashboardNotification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }),
        prisma.dashboardNotification.count({ where: { ...where, readAt: null } })
      ]);
      res.json({ notifications: rows.slice(0, limit).map(notificationSummary), unreadCount, nextCursor: rows.length > limit ? rows[limit - 1].id : null });
    } catch (error) { next(error); }
  });
  router.post("/read-all", async (req, res, next) => {
    try {
      await syncAssignmentNotifications(prisma, req.user);
      await prisma.dashboardNotification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
      res.json({ unreadCount: 0 });
    } catch (error) { next(error); }
  });
  router.post("/:id/read", async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const row = await prisma.dashboardNotification.findFirst({ where: { id, userId: req.user.id } });
      if (!row) throw new ReviewError("Notification not found.", 404);
      await prisma.dashboardNotification.updateMany({ where: { id, userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
      res.json({ read: true });
    } catch (error) { next(error); }
  });
  router.use(reviewErrors);
  return router;
}
