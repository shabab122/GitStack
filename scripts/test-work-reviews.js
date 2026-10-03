import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { createWorkReviewRouter, createDashboardNotificationRouter } from "../routes/work-review-routes.js";
import { captureReviewEvidence } from "../services/reviews/gitea-review-evidence.js";

// A disposable fixture. No database, Gitea credentials or Docker services are used.
export function reviewFixture() {
  const users = Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), role: i < 3 ? "STUDENT" : "INSTRUCTOR", isActive: true,
    fullName: ["Shabab", "Ayesha", "Rakib", "Team Instructor", "Other Instructor"][i], universityId: `U00${i}`, xp: 400, giteaUsername: `qa-user-${i}` }));
  const [student, teammate, outsider, instructor, otherInstructor] = users;
  const team = { id: randomUUID(), name: "Review Team", createdById: instructor.id, giteaOwner: "gitstack", giteaRepository: "review-team", giteaRepositoryId: 101,
    members: [{ userId: student.id }, { userId: teammate.id }], createdBy: instructor };
  const mission = { id: randomUUID(), title: "Team Login Mission", slug: "team-login", missionType: "TEAM" };
  const assignment = { id: randomUUID(), teamId: team.id, studentId: null, createdById: instructor.id, createdBy: instructor, status: "ACTIVE", createdAt: new Date(),
    startsAt: null, dueAt: null, missionTemplate: mission, team };
  const personal = { ...assignment, id: randomUUID(), teamId: null, team: null, studentId: student.id, missionTemplate: { ...mission, title: "Documentation Mission", slug: "docs", missionType: "INDIVIDUAL" } };
  const draft = { ...personal, id: randomUUID(), status: "DRAFT" };
  const assignments = [assignment, personal, draft], teams = [team];
  let reviews = [], notifications = [], queue = Promise.resolve();
  let failNotification = false;
  function hydrate(row) { return row ? { ...row, student: users.find((user) => user.id === row.studentId) || null, instructor: users.find((user) => user.id === row.instructorId) || null,
    assignment: assignments.find((item) => item.id === row.assignmentId) || null } : null; }
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "OR") return value.some((item) => matches(row, item));
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("in" in value) return value.in.includes(row[key]);
        if ("not" in value) return row[key] !== value.not;
        if ("some" in value) return (row[key] || []).some((item) => matches(item, value.some));
        return row[key] && matches(row[key], value);
      }
      return row[key] === value;
    });
  }
  function list(items, input = {}) {
    let result = items.filter((row) => matches(row, input.where));
    if (input.orderBy) result.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || b.id.localeCompare(a.id));
    if (input.cursor) result = result.slice(result.findIndex((row) => row.id === input.cursor.id) + (input.skip || 0));
    return input.take ? result.slice(0, input.take) : result;
  }
  const prisma = {
    team: { findFirst: async ({ where }) => teams.find((row) => matches(row, where)) || null,
      findMany: async (input) => list(teams, input).map((row) => ({ ...row, assignments: assignments.filter((item) => item.teamId === row.id && item.status !== "DRAFT") })) },
    assignment: { findFirst: async ({ where }) => assignments.find((row) => matches(row, where)) || null, findMany: async (input) => list(assignments, input) },
    workReviewRequest: {
      findUnique: async ({ where }) => hydrate(reviews.find((row) => matches(row, where))),
      findFirst: async ({ where }) => hydrate(reviews.find((row) => matches(row, where))),
      findMany: async (input) => list(reviews, input).map(hydrate), count: async ({ where }) => reviews.filter((row) => matches(row, where)).length,
      create: async ({ data }) => { const row = { id: randomUUID(), status: "PENDING", feedback: null, reviewedAt: null, createdAt: new Date(), ...structuredClone(data) }; reviews.push(row); return hydrate(row); },
      update: async ({ where, data }) => { const row = reviews.find((item) => matches(item, where)); Object.assign(row, structuredClone(data)); return hydrate(row); }
    },
    dashboardNotification: {
      findFirst: async ({ where }) => notifications.find((row) => matches(row, where)) || null,
      findMany: async (input) => list(notifications, input), count: async ({ where }) => notifications.filter((row) => matches(row, where)).length,
      create: async ({ data }) => {
        if (failNotification) throw new Error("Test notification storage failure");
        assert(!notifications.some((row) => row.dedupeKey === data.dedupeKey));
        const row = { id: randomUUID(), readAt: null, createdAt: new Date(), ...structuredClone(data) }; notifications.push(row); return row;
      },
      createMany: async ({ data }) => { for (const row of data) if (!notifications.some((item) => item.dedupeKey === row.dedupeKey)) await prisma.dashboardNotification.create({ data: row }); },
      updateMany: async ({ where, data }) => { const selected = notifications.filter((row) => matches(row, where)); selected.forEach((row) => Object.assign(row, structuredClone(data))); return { count: selected.length }; }
    },
    $queryRawUnsafe: async (sql, id) => { assert.match(sql, /^SELECT "id" FROM "(?:Team|WorkReviewRequest)" WHERE "id" = \$1 FOR UPDATE$/); assert.equal(typeof id, "string"); },
    $transaction: (action) => {
      const transaction = queue.then(async () => { const oldReviews = structuredClone(reviews), oldNotifications = structuredClone(notifications);
        try { return await action(prisma); } catch (error) { reviews = oldReviews; notifications = oldNotifications; throw error; } });
      queue = transaction.catch(() => {}); return transaction;
    }
  };
  const baseSha = "a".repeat(40), headSha = "b".repeat(40), nextSha = "c".repeat(40);
  const makeCommit = (sha) => ({ sha, parents: [{ sha: baseSha }], commit: { message: "Add input validation" }, files: [{ filename: "src/login.js", status: "modified" }] });
  const evidenceClient = {
    getReviewRepository: async () => ({ id: 101, default_branch: "main" }),
    getReviewBranch: async (_owner, _repo, ref) => ({ commit: { id: ref === "main" ? baseSha : headSha } }),
    getReviewCommit: async (_owner, _repo, ref) => { if (!ref || ref === "d".repeat(40)) { const error = new Error("Missing commit"); error.status = 404; throw error; } return makeCommit(ref.startsWith("c") ? nextSha : ref === baseSha ? baseSha : headSha); },
    getReviewPullRequest: async () => ({ head: { sha: headSha, repo: { id: 101 } }, base: { sha: baseSha } }),
    getReviewComparison: async () => ({ commits: [makeCommit(headSha)], total_commits: 1 }),
    getReviewCommitDiff: async () => 'diff --git a/src/login.js b/src/login.js\n--- a/src/login.js\n+++ b/src/login.js\n@@ -1 +1 @@\n-const valid = false;\n+const valid = "<script>unsafe text</script>";'
  };
  const app = express(); app.use(express.json());
  const requireAuth = (req, res, next) => { req.user = users.find((user) => user.id === req.get("x-user-id")); if (!req.user) return res.status(401).json({ error: "Authentication required." }); next(); };
  app.use("/api/reviews", createWorkReviewRouter({ requireAuth, prisma, evidenceClient }));
  app.use("/api/notifications", createDashboardNotificationRouter({ requireAuth, prisma }));
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  return { app, prisma, users, student, teammate, outsider, instructor, otherInstructor, team, teams, assignments, assignment, personal, draft, evidenceClient,
    headSha, nextSha, get reviews() { return reviews; }, get notifications() { return notifications; }, failNotification(value) { failNotification = value; } };
}
async function run() {
  const f = reviewFixture(), server = f.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(user, path, method = "GET", body) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(user ? { "x-user-id": user.id } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  const input = () => ({ clientRequestId: randomUUID(), teamId: f.team.id, assignmentId: f.assignment.id, title: "Review login validation", summary: "I changed the input validation and tested empty names.", referenceType: "BRANCH", reference: "feature/login", files: ["src/login.js"] });
  try {
    assert.equal((await request(null, "/api/reviews/requests")).status, 401);
    assert.equal((await request(f.instructor, "/api/reviews/contexts")).status, 403);
    assert.equal((await request(f.student, "/api/reviews/contexts")).body.teams.length, 1);
    assert.equal((await request(f.outsider, "/api/reviews/contexts")).body.teams.length, 0);
    assert.equal((await request(f.outsider, "/api/reviews/requests", "POST", input())).status, 404);
    assert.equal((await request(f.instructor, "/api/reviews/requests", "POST", input())).status, 403);
    assert.equal((await request(f.student, "/api/reviews/requests", "POST", { ...input(), instructorId: f.otherInstructor.id })).status, 400);
    const submitted = input();
    const attempts = await Promise.all([request(f.student, "/api/reviews/requests", "POST", submitted), request(f.student, "/api/reviews/requests", "POST", submitted)]);
    assert.deepEqual(attempts.map((row) => row.status).sort(), [200, 201]);
    const id = attempts[0].body.review.id;
    assert.equal(f.reviews.length, 1); assert.equal(f.notifications.length, 1);
    assert.equal(attempts[0].body.review.evidence.headSha, f.headSha);
    assert.equal(attempts[0].body.review.instructor.id, f.instructor.id);
    assert.equal((await request(f.student, "/api/reviews/requests", "POST", input())).status, 200, "same pending snapshot is reused");
    assert.equal((await request(f.teammate, `/api/reviews/requests/${id}`)).status, 404);
    assert.equal((await request(f.otherInstructor, `/api/reviews/requests/${id}`)).status, 404);
    assert.equal((await request(f.otherInstructor, "/api/reviews/requests")).body.total, 0);
    const instructorFeed = await request(f.instructor, "/api/notifications");
    assert.equal(instructorFeed.body.unreadCount, 1); assert.equal(instructorFeed.body.notifications[0].kind, "REVIEW_REQUESTED");
    assert.equal((await request(f.student, `/api/notifications/${f.notifications[0].id}/read`, "POST")).status, 404);
    assert.equal((await request(f.student, "/api/notifications")).body.notifications.length, 2, "individual + own team assignments");
    assert.equal((await request(f.teammate, "/api/notifications")).body.notifications.length, 1);
    assert.equal((await request(f.outsider, "/api/notifications")).body.notifications.length, 0);
    await request(f.student, "/api/notifications");
    assert.equal(f.notifications.filter((row) => row.userId === f.student.id).length, 2, "polling does not duplicate assignments");
    f.draft.status = "ACTIVE";
    assert.equal((await request(f.student, "/api/notifications")).body.notifications.length, 3, "draft activation triggers its first notification");
    const feedback = { status: "CHANGES_REQUESTED", feedback: "Add a test for whitespace-only names, then send the revised commit." };
    assert.equal((await request(f.student, `/api/reviews/requests/${id}/feedback`, "POST", feedback)).status, 403);
    assert.equal((await request(f.otherInstructor, `/api/reviews/requests/${id}/feedback`, "POST", feedback)).status, 404);
    assert.equal((await request(f.instructor, `/api/reviews/requests/${id}/feedback`, "POST", { ...feedback, feedback: "" })).status, 400);
    const replies = await Promise.all([request(f.instructor, `/api/reviews/requests/${id}/feedback`, "POST", feedback), request(f.instructor, `/api/reviews/requests/${id}/feedback`, "POST", feedback)]);
    assert(replies.every((row) => row.status === 200));
    assert.equal(f.notifications.filter((row) => row.kind === "REVIEW_FEEDBACK").length, 1);
    assert.equal((await request(f.student, `/api/reviews/requests/${id}`)).body.review.feedback, feedback.feedback);
    assert.equal((await request(f.teammate, "/api/notifications")).body.notifications.some((row) => row.kind === "REVIEW_FEEDBACK"), false);
    assert.equal((await request(f.instructor, `/api/reviews/requests/${id}/feedback`, "POST", { ...feedback, status: "APPROVED" })).status, 409);
    assert.equal((await request(f.instructor, "/api/notifications")).body.unreadCount, 0);
    await request(f.student, `/api/reviews/requests/${id}/seen`, "POST");
    const newCommit = { ...input(), referenceType: "COMMIT", reference: f.nextSha };
    assert.equal((await request(f.student, "/api/reviews/requests", "POST", newCommit)).status, 201);
    assert.equal((await request(f.student, "/api/reviews/requests?status=PENDING")).body.requests.length, 1);
    const page = (await request(f.student, "/api/reviews/requests?limit=1")).body;
    assert.equal(page.requests.length, 1); assert(page.nextCursor);
    assert.equal((await request(f.student, `/api/reviews/requests?limit=1&cursor=${page.nextCursor}`)).body.requests.length, 1);
    assert.equal((await request(f.outsider, `/api/reviews/requests?cursor=${id}`)).status, 404);
    await request(f.student, "/api/notifications/read-all", "POST");
    assert.equal((await request(f.student, "/api/notifications")).body.unreadCount, 0);
    assert.equal((await request(f.student, "/api/reviews/requests", "POST", { ...input(), reference: "../secret" })).status, 400);
    assert.equal((await request(f.student, "/api/reviews/requests", "POST", { ...input(), files: ["not-in-change.js"] })).status, 400);
    assert.equal((await request(f.student, "/api/reviews/requests", "POST", { ...input(), assignmentId: f.personal.id })).status, 400);
    assert.equal((await request(f.student, "/api/reviews/requests", "POST", { ...input(), referenceType: "COMMIT", reference: "d".repeat(40) })).status, 400);
    const count = f.reviews.length;
    const original = f.evidenceClient.getReviewRepository;
    f.evidenceClient.getReviewRepository = async () => { throw new Error("Test Gitea offline"); };
    assert.equal((await request(f.student, "/api/reviews/requests", "POST", input())).status, 503); assert.equal(f.reviews.length, count);
    f.evidenceClient.getReviewRepository = original;
    f.failNotification(true);
    assert.equal((await request(f.teammate, "/api/reviews/requests", "POST", input())).status, 500);
    assert.equal(f.reviews.length, count, "notification failure rolls back request"); f.failNotification(false);
    const prEvidence = await captureReviewEvidence({ team: f.team, input: { ...input(), referenceType: "PULL_REQUEST", reference: "#12" }, client: f.evidenceClient });
    assert.match(prEvidence.referenceUrl, /\/pulls\/12$/); assert.equal(prEvidence.headSha, f.headSha);
    assert(!JSON.stringify(prEvidence).includes("token"));
    f.team.members = f.team.members.filter((member) => member.userId !== f.student.id);
    assert.equal((await request(f.student, "/api/reviews/requests", "POST", input())).status, 404);
    assert.equal((await request(f.student, `/api/reviews/requests/${id}`)).status, 200, "own historical feedback remains readable");
    assert(f.users.every((user) => user.xp === 400), "reviews never change XP");
    console.log("Work reviews passed: verified snapshots, private ownership, instructor replies, duplicate/concurrent retries, rollback, assignment fan-out, draft activation, read state, pagination, invalid references, Gitea failure and unchanged XP.");
  } finally { await new Promise((resolve) => server.close(resolve)); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await run();
