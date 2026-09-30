import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.GITEA_ADMIN_TOKEN = "test-service-token";
process.env.GITEA_WEBHOOK_SECRET = "test-webhook-secret";

const {
  buildCollaborationWorkflow,
  collaborationEventTime,
  collaborationWebhookTargetUrl,
  ensureWebhook,
  getCollaborationReport,
  processGiteaWebhook
} = await import("../services/collaboration/collaboration-service.js");

const stableTarget = "http://host.docker.internal:3000/api/gitea/webhook";
const legacyTarget = "http://172.23.0.1:3000/api/gitea/webhook";
assert.equal(collaborationWebhookTargetUrl(legacyTarget), stableTarget);
assert.equal(collaborationWebhookTargetUrl("http://webhook.internal:3000/api/gitea/webhook"), "http://webhook.internal:3000/api/gitea/webhook");
assert.match(readFileSync(".env.example", "utf8"), /GITEA_WEBHOOK_TARGET_URL=http:\/\/host\.docker\.internal:3000\/api\/gitea\/webhook/);
assert.match(readFileSync("public/sandbox-terminal.js", "utf8"), /!collaborationMode\s*&&\s*data === lastTerminalInput/, "Collaboration terminal must preserve repeated command characters");

const team = { id: "team-1", giteaOwner: "gitstack", giteaRepository: "team-one", giteaRepositoryId: 42, giteaWebhookId: 17 };
let updatedHook = null;
let createdHook = false;
const previousFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "PATCH") {
      assert.match(url, /\/hooks\/17$/);
      updatedHook = JSON.parse(options.body);
      return new Response(JSON.stringify({ id: 17, config: { url: updatedHook.config.url } }), { status: 200 });
    }
    if (options.method === "POST") createdHook = true;
    return new Response(JSON.stringify([{ id: 17, config: { url: legacyTarget } }]), { status: 200 });
  };
  const database = { team: { update: async ({ data }) => { assert.equal(data.giteaWebhookId, 17); } } };
  const repair = await ensureWebhook({ prisma: database, team });
  assert.equal(repair.configured, true);
  assert.equal(repair.id, 17);
  assert.equal(updatedHook.config.url, stableTarget);
  assert.equal(updatedHook.config.secret, process.env.GITEA_WEBHOOK_SECRET);
  assert.equal(updatedHook.active, true);
  assert.equal(createdHook, false, "Repairing a saved hook must not duplicate webhook delivery");

  globalThis.fetch = async () => { throw new Error("Gitea is offline"); };
  await assert.rejects(ensureWebhook({ prisma: database, team }), /Gitea is offline/);
  assert.equal(createdHook, false, "A failed hook lookup must not create a duplicate hook");
} finally {
  globalThis.fetch = previousFetch;
}

const receivedAt = new Date("2026-09-29T13:20:00.000Z");
const oldRepositoryTimestamp = "2026-09-20T00:00:00.000Z";
assert.equal(collaborationEventTime("REVIEW", {
  repository: { updated_at: oldRepositoryTimestamp },
  review: { submitted_at: "2026-09-29T13:19:58.000Z" }
}, receivedAt).toISOString(), "2026-09-29T13:19:58.000Z");
assert.equal(collaborationEventTime("CHANGES_REQUESTED", {
  repository: { updated_at: oldRepositoryTimestamp }
}, receivedAt).toISOString(), receivedAt.toISOString());
assert.equal(collaborationEventTime("MERGE", {
  pull_request: { merged_at: "2026-09-29T13:19:59.000Z", updated_at: oldRepositoryTimestamp }
}, receivedAt).toISOString(), "2026-09-29T13:19:59.000Z");

const assignment = {
  id: "assignment-1", teamId: team.id, missionTemplateId: "mission-1", status: "ACTIVE",
  collaborationPreparedAt: null, giteaIssueNumber: 3,
  missionTemplate: { id: "mission-1", missionType: "TEAM", slug: "collaboration", title: "Team Collaboration", description: "" },
  updatedAt: receivedAt,
  team: {
    ...team, name: "Team One", giteaRepositoryUrl: "http://localhost:3002/gitstack/team-one",
    members: [
      { userId: "feature", teamRole: "FEATURE_DEVELOPER", user: { id: "feature", fullName: "Feature", giteaUsername: "feature-gitea", universityId: "1", role: "STUDENT", isActive: true } },
      { userId: "test", teamRole: "TEST_DEVELOPER", user: { id: "test", fullName: "Test", giteaUsername: "test-gitea", universityId: "2", role: "STUDENT", isActive: true } },
      { userId: "reviewer", teamRole: "CODE_REVIEWER", user: { id: "reviewer", fullName: "Reviewer", giteaUsername: "reviewer-gitea", universityId: "3", role: "STUDENT", isActive: true } }
    ]
  }
};
const runs = assignment.team.members.map((member) => ({
  id: `run-${member.userId}`, assignmentId: assignment.id, userId: member.userId, teamRole: member.teamRole,
  giteaRepositoryId: team.giteaRepositoryId, status: "NOT_STARTED", progressPercent: 0,
  createdAt: receivedAt, updatedAt: receivedAt, gitEvents: [], assessmentResult: null, feedback: [], sandboxSessions: []
}));
assignment.missionRuns = runs;
let sequence = 0;
const prisma = {
  team: { findFirst: async () => assignment.team },
  assignment: {
    findMany: async () => [assignment],
    findUnique: async () => assignment
  },
  missionRun: {
    findFirst: async ({ where }) => runs.find((run) => run.assignmentId === where.assignmentId && run.userId === where.userId) || null
  },
  user: {
    findFirst: async ({ where }) => assignment.team.members.find((member) => member.user.giteaUsername === where.giteaUsername.equals)?.user || null
  },
  gitEvent: {
    create: async ({ data }) => {
      const record = { ...data, id: `event-${++sequence}`, createdAt: new Date(receivedAt.getTime() + sequence * 1000) };
      runs.find((run) => run.id === data.missionRunId).gitEvents.push(record);
      return record;
    },
    findMany: async ({ where }) => runs.flatMap((run) => run.gitEvents)
      .filter((event) => where.missionRunId.in.includes(event.missionRunId))
      .sort((left, right) => new Date(left.occurredAt) - new Date(right.occurredAt))
  },
  $transaction: async (action) => action({
    assessmentResult: { upsert: async ({ where, create, update }) => {
      const run = runs.find((item) => item.id === where.missionRunId);
      run.assessmentResult = { ...(run.assessmentResult ? update : create), missionRunId: run.id };
    } },
    feedback: {
      deleteMany: async ({ where }) => { runs.find((run) => run.id === where.missionRunId).feedback = []; },
      create: async ({ data }) => { runs.find((run) => run.id === data.missionRunId).feedback.push(data); }
    },
    missionRun: { update: async ({ where, data }) => {
      Object.assign(runs.find((run) => run.id === where.id), data, { updatedAt: new Date() });
    } }
  })
};
const push = {
  repository: { id: team.giteaRepositoryId, name: team.giteaRepository },
  ref: "refs/heads/feature/login-improvement", after: "aabbcc",
  commits: [{ id: "aabbcc", message: "Implement the feature", modified: ["src/login-policy.txt"] }]
};
const outsider = await processGiteaWebhook({ prisma, eventName: "push", deliveryId: "outsider", payload: { ...push, sender: { login: "outsider" } } });
assert.equal(outsider.stored, 0);
const stored = await processGiteaWebhook({ prisma, eventName: "push", deliveryId: "student", payload: { ...push, sender: { login: "feature-gitea" } } });
assert.equal(stored.stored, 2);
assert.equal(runs[0].gitEvents.length, 2);
assert.equal(runs[0].gitEvents.every((event) => event.actorUserId === "feature"), true);
const before = await getCollaborationReport({ prisma, assignmentId: assignment.id });
assert.equal(before.stats.totalEvents, 2);
assert.equal(before.workflow.steps.find((step) => step.eventType === "PUSH").count, 1);

const duplicateBranch = {
  id: "branch-provisioned", eventType: "BRANCH", branch: "feature/login-improvement",
  actorUserId: null, occurredAt: oldRepositoryTimestamp, createdAt: receivedAt,
  payload: { source: "gitstack-provisioning" }
};
runs[0].gitEvents.push(duplicateBranch);
const afterFirst = await getCollaborationReport({ prisma, assignmentId: assignment.id });
runs[0].gitEvents.push({ ...duplicateBranch, id: "branch-signed", createdAt: new Date(receivedAt.getTime() + 2000) });
const afterSecond = await getCollaborationReport({ prisma, assignmentId: assignment.id });
assert.equal(afterSecond.workflow.steps.find((step) => step.eventType === "BRANCH").count, 1);
assert.notEqual(afterFirst.sync.version, afterSecond.sync.version, "Each new event must refresh the instructor timeline");
assert.equal(buildCollaborationWorkflow([{ id: "seed-push", eventType: "PUSH", actorUserId: null }]).steps.find((step) => step.eventType === "PUSH").count, 0);

// A prepared assignment processes signed student work, reassesses each role,
// and exposes the same changes through the instructor's shared report.
assignment.collaborationPreparedAt = receivedAt;
globalThis.fetch = async () => new Response(JSON.stringify({ message: "not found" }), { status: 404 });
try {
const featureLive = await processGiteaWebhook({
  prisma, eventName: "push", deliveryId: "feature-followup",
  payload: {
    ...push, after: "feature-followup", sender: { login: "feature-gitea" },
    commits: [{ id: "feature-followup", message: "Enable feature flag", modified: ["src/login-policy.txt"] }]
  }
});
assert.equal(featureLive.stored, 2);
assert.equal(featureLive.report.results.find((member) => member.userId === "feature").individualScore > 0, true);
const testLive = await processGiteaWebhook({
  prisma, eventName: "push", deliveryId: "test-guard",
  payload: {
    ...push, ref: "refs/heads/test/login-improvement", after: "test-guard", sender: { login: "test-gitea" },
    commits: [{ id: "test-guard", message: "Add login guard tests", modified: ["tests/test-evidence.md"] }]
  }
});
assert.equal(testLive.stored, 3);
const reviewLive = await processGiteaWebhook({
  prisma, eventName: "pull_request_review", deliveryId: "review-feature",
  payload: {
    repository: push.repository, sender: { login: "reviewer-gitea" },
    pull_request: { number: 5, head: { ref: "feature/login-improvement" } },
    review: { type: "comment", content: "Please keep the feature flag enabled.", created_at: "2026-09-29T13:21:00.000Z" }
  }
});
assert.equal(reviewLive.stored, 1);
} finally {
  globalThis.fetch = previousFetch;
}
const instructor = await getCollaborationReport({ prisma, assignmentId: assignment.id });
assert.equal(instructor.runs.find((run) => run.userId === "feature").status, "IN_PROGRESS");
assert.equal(instructor.runs.find((run) => run.userId === "test").status, "IN_PROGRESS");
assert.equal(instructor.runs.find((run) => run.userId === "reviewer").status, "IN_PROGRESS");
assert.equal(instructor.runs.find((run) => run.userId === "reviewer").assessment.individualScore, 25);
assert.equal(instructor.timeline.some((event) => event.actorUserId === "test" && event.type === "TEST"), true);
assert.equal(instructor.timeline.some((event) => event.actorUserId === "reviewer" && event.type === "REVIEW"), true);
assert.equal(instructor.stats.totalEvents, 10);

console.log("Collaboration webhook repair, student attribution, event ordering and shared instructor report sync passed.");
