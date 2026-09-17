import assert from "node:assert/strict";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function source(file) {
  assert.equal(existsSync(file), true, `${file} is missing`);
  return readFileSync(file, "utf8");
}

const schema = source("prisma/schema.prisma");
for (const token of [
  "giteaUsername",
  "giteaRepositoryId",
  "giteaWebhookId",
  "collaborationPreparedAt",
  "giteaIssueNumber",
  "collaborationState",
  "teamRole          TeamRole?",
  "deliveryId",
  "scoreValue"
]) assert.match(schema, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Schema is missing ${token}`);
for (const event of ["ISSUE", "BRANCH", "COMMIT", "PUSH", "PULL_REQUEST", "REVIEW", "APPROVAL", "CHANGES_REQUESTED", "TEST", "MERGE", "CONFLICT_RESOLUTION"]) {
  assert.match(schema, new RegExp(`\\b${event}\\b`), `GitEventType.${event} is missing`);
}

const migration = source("prisma/migrations/20260916230000_complete_collaboration_workflow/migration.sql");
assert.match(migration, /giteaWebhookId/);
assert.match(migration, /collaborationPreparedAt/);
assert.match(migration, /scoreValue/);

const collaboration = source("services/collaboration/collaboration-service.js");
for (const feature of [
  "provisionTeamRepository",
  "prepareCollaborationAssignment",
  "startCollaborationWorkspace",
  "verifyGiteaSignature",
  "processGiteaWebhook",
  "assessCollaborationAssignment",
  "getCollaborationReport",
  "resyncTeamAccess"
]) assert.match(collaboration, new RegExp(`export async function ${feature}|export function ${feature}`), `${feature} is missing`);
assert.match(collaboration, /feature\/login-improvement/);
assert.match(collaboration, /test\/login-improvement/);
assert.match(collaboration, /review\/login-improvement/);
assert.match(collaboration, /AUTH_MODE=secure-verified/);
assert.match(collaboration, /tests\/test-evidence\.md/);
assert.match(collaboration, /FEATURE_FLAG=enabled/);
assert.match(collaboration, /TEST_GUARD=enabled/);
assert.match(collaboration, /FAIL:/);
assert.match(collaboration, /Specific Pull Request review comment submitted/);
assert.match(collaboration, /const totalScore = individualScore \+ teamScore;/, "Documented 70/30 collaboration score is not implemented as 70 role points + 30 team points");
assert.match(collaboration, /createRepositoryWebhook/);
assert.match(collaboration, /pull_request_review/);
assert.match(collaboration, /payload\.review\?\.type/, "Gitea review.type handling is missing");
assert.match(collaboration, /\["PUSH", "COMMIT", "TEST"\]/, "Commit/test branch mapping is missing");
assert.match(collaboration, /controlledConflictEvidence/, "Controlled conflict evidence validation is missing");

const webhook = source("routes/gitea-webhook-routes.js");
assert.match(webhook, /X-Gitea-Signature/i);
assert.match(webhook, /X-Gitea-Event/i);
assert.match(webhook, /X-Gitea-Event-Type/i);
assert.match(webhook, /verifyGiteaSignature/);
assert.match(webhook, /processGiteaWebhook/);

const server = source("server.js");
assert.match(server, /req\.rawBody = Buffer\.from\(buffer\)/);
assert.match(server, /createGiteaWebhookRouter/);
assert.match(server, /\/api\/gitea\/webhook/);

const instructor = source("routes/instructor-routes.js");
for (const route of [
  'router.post("/assignments/:id/prepare-collaboration"',
  'router.post("/assignments/:id/assess-collaboration"',
  'router.get("/assignments/:id/collaboration-report"'
]) assert.match(instructor, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(instructor, /prepareCollaborationAssignment/);

const student = source("routes/student-routes.js");
for (const route of [
  'router.post("/team/assignments/:id/start"',
  'router.get("/team/assignments/:id/report"',
  'router.post("/team/assignments/:id/assess"'
]) assert.match(student, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(student, /startCollaborationWorkspace/);

const giteaClient = source("services/gitea/gitea-client.js");
for (const method of ["ensureOrganization", "createRepository", "createBranch", "createPullRequest", "createRepositoryWebhook", "addRepositoryToTeam", "addTeamMember", "removeTeamMember"]) {
  assert.match(giteaClient, new RegExp(`export async function ${method}`), `${method} is missing from Gitea client`);
}

const compose = source("docker-compose.yml");
assert.match(compose, /gitea-db:/, "Dedicated Gitea database service is missing");
assert.match(compose, /gitstack-sandbox-network/, "Collaboration Docker network is missing");
assert.match(compose, /host\.docker\.internal:host-gateway/, "Gitea-to-host webhook bridge is missing");

const env = source(".env.example");
assert.match(env, /GITEA_INTERNAL_BASE_URL=http:\/\/gitstack-gitea:3000/);
assert.match(env, /GITEA_WEBHOOK_TARGET_URL=/);
assert.match(env, /GITEA_WEBHOOK_SECRET=/);
assert.doesNotMatch(env, /GITEA_ADMIN_TOKEN=[a-f0-9]{32,}/i, ".env.example contains a token-like secret");

for (const file of [
  "public/instructor-collaboration.html",
  "public/instructor-collaboration.js",
  "public/student-team.js"
]) source(file);
const instructorCollab = source("public/instructor-collaboration.js");
assert.match(instructorCollab, /collaboration-report/);
assert.match(instructorCollab, /assess-collaboration/);
const studentTeam = source("public/student-team.js");
assert.match(studentTeam, /assignments\/.*\/start/);
assert.match(studentTeam, /Check workflow/);
assert.match(studentTeam, /View report/);

// Execute focused behavior tests for the event classifier, branch extraction,
// webhook signature verification and deterministic-conflict evidence. These do
// not require Docker, PostgreSQL or a live Gitea server.
process.env.GITEA_WEBHOOK_SECRET = "gitstack-test-webhook-secret";
const {
  classifyGiteaWebhook,
  extractWebhookBranch,
  controlledConflictEvidence,
  evaluateCollaborationEvidence,
  verifyGiteaSignature
} = await import("../services/collaboration/collaboration-service.js");

assert.deepEqual(
  classifyGiteaWebhook("pull_request_review", "pull_request_review_approved", { review: { type: "comment" }, action: "reviewed" }),
  ["APPROVAL"]
);
assert.deepEqual(
  classifyGiteaWebhook("pull_request_review", "pull_request_review_rejected", { review: { type: "approved" }, action: "reviewed" }),
  ["CHANGES_REQUESTED"]
);
assert.deepEqual(
  classifyGiteaWebhook("pull_request_review", "", { review: { type: "approved" }, action: "reviewed" }),
  ["APPROVAL"]
);
assert.deepEqual(
  classifyGiteaWebhook("pull_request_review", "", { review: { type: "rejected" }, action: "reviewed" }),
  ["CHANGES_REQUESTED"]
);
assert.equal(extractWebhookBranch({ ref: "refs/heads/feature/login-improvement" }, "COMMIT"), "feature/login-improvement");
assert.equal(extractWebhookBranch({ ref: "refs/heads/test/login-improvement" }, "TEST"), "test/login-improvement");

const conflictEvents = [
  {
    eventType: "COMMIT",
    actorUserId: "feature-user",
    branch: "feature/login-improvement",
    payload: { commit: { modified: ["src/login-policy.txt"] } }
  },
  {
    eventType: "COMMIT",
    actorUserId: "test-user",
    branch: "test/login-improvement",
    payload: { commit: { modified: ["src/login-policy.txt", "tests/test-evidence.md"] } }
  },
  { eventType: "MERGE", actorUserId: "reviewer", branch: "feature/login-improvement", payload: {} },
  { eventType: "MERGE", actorUserId: "reviewer", branch: "test/login-improvement", payload: {} }
];
assert.deepEqual(
  controlledConflictEvidence({
    events: conflictEvents,
    featureUserId: "feature-user",
    testUserId: "test-user",
    finalConflictText: "AUTH_MODE=secure-verified\nFEATURE_FLAG=enabled\nTEST_GUARD=enabled\nSESSION_POLICY=basic\n"
  }),
  { passed: true, featureTouched: true, testTouched: true, finalStateOk: true, mergedTwice: true, correctMergeOrder: true }
);
assert.equal(
  controlledConflictEvidence({
    events: conflictEvents.filter((event) => event.actorUserId !== "test-user"),
    featureUserId: "feature-user",
    testUserId: "test-user",
    finalConflictText: "AUTH_MODE=secure-verified\nFEATURE_FLAG=enabled\nTEST_GUARD=enabled\n"
  }).passed,
  false
);

const raw = Buffer.from('{"repository":{"id":1}}');
const signature = crypto.createHmac("sha256", process.env.GITEA_WEBHOOK_SECRET).update(raw).digest("hex");
assert.equal(verifyGiteaSignature(raw, signature), true);
assert.equal(verifyGiteaSignature(raw, "0".repeat(signature.length)), false);

const at = (minute) => new Date(`2026-09-17T00:${String(minute).padStart(2, "0")}:00Z`);
const prPayload = (number, branch) => ({ pull_request: { number, head: { ref: branch }, title: `Mission PR ${number}`, body: "Closes #42" } });
const commitPayload = (message, modified) => ({ commit: { message, modified } });
const fullWorkflowEvents = [
  { id: "e1", eventType: "ISSUE", actorUserId: null, branch: null, occurredAt: at(1), payload: { issue: { number: 42 } } },
  { id: "e2", eventType: "BRANCH", actorUserId: null, branch: "feature/login-improvement", occurredAt: at(2), payload: {} },
  { id: "e3", eventType: "COMMIT", actorUserId: "feature-user", branch: "feature/login-improvement", occurredAt: at(3), payload: commitPayload("Implement secure feature mode", ["src/login-policy.txt"]) },
  { id: "e4", eventType: "COMMIT", actorUserId: "feature-user", branch: "feature/login-improvement", occurredAt: at(4), payload: commitPayload("Enable feature login flag", ["src/login-policy.txt"]) },
  { id: "e5", eventType: "PUSH", actorUserId: "feature-user", branch: "feature/login-improvement", occurredAt: at(5), payload: {} },
  { id: "e6", eventType: "PULL_REQUEST", actorUserId: "feature-user", branch: "feature/login-improvement", occurredAt: at(6), giteaResourceId: "11", payload: prPayload(11, "feature/login-improvement") },
  { id: "e7", eventType: "REVIEW", actorUserId: "reviewer-user", branch: "feature/login-improvement", occurredAt: at(7), payload: { review: { content: "Please preserve the feature flag and add verification." } } },
  { id: "e8", eventType: "CHANGES_REQUESTED", actorUserId: "reviewer-user", branch: "feature/login-improvement", occurredAt: at(8), payload: { review: { type: "rejected" } } },
  { id: "e9", eventType: "COMMIT", actorUserId: "feature-user", branch: "feature/login-improvement", occurredAt: at(9), payload: commitPayload("Address requested review changes", ["src/login-policy.txt"]) },
  { id: "e10", eventType: "COMMIT", actorUserId: "test-user", branch: "test/login-improvement", occurredAt: at(10), payload: commitPayload("Add login policy verification", ["src/login-policy.txt", "tests/test-evidence.md"]) },
  { id: "e11", eventType: "PUSH", actorUserId: "test-user", branch: "test/login-improvement", occurredAt: at(11), payload: {} },
  { id: "e12", eventType: "TEST", actorUserId: "test-user", branch: "test/login-improvement", occurredAt: at(12), payload: commitPayload("Record test evidence", ["tests/test-evidence.md"]) },
  { id: "e13", eventType: "PULL_REQUEST", actorUserId: "test-user", branch: "test/login-improvement", occurredAt: at(13), giteaResourceId: "12", payload: prPayload(12, "test/login-improvement") },
  { id: "e14", eventType: "APPROVAL", actorUserId: "reviewer-user", branch: "test/login-improvement", occurredAt: at(14), payload: { review: { type: "approved" } } },
  { id: "e15", eventType: "MERGE", actorUserId: "reviewer-user", branch: "feature/login-improvement", occurredAt: at(15), payload: {} },
  { id: "e16", eventType: "MERGE", actorUserId: "reviewer-user", branch: "test/login-improvement", occurredAt: at(16), payload: {} }
];
const evaluation = evaluateCollaborationEvidence({
  members: [
    { userId: "feature-user", teamRole: "FEATURE_DEVELOPER" },
    { userId: "test-user", teamRole: "TEST_DEVELOPER" },
    { userId: "reviewer-user", teamRole: "CODE_REVIEWER" }
  ],
  events: fullWorkflowEvents,
  issueNumber: 42,
  testEvidence: "FAIL: conflict was unresolved\nPASS: final policy verified\n",
  finalConflict: "AUTH_MODE=secure-verified\nFEATURE_FLAG=enabled\nTEST_GUARD=enabled\nSESSION_POLICY=basic\n"
});
assert.equal(evaluation.workflowComplete, true);
assert.equal(evaluation.teamScore, 30);
assert.deepEqual(evaluation.memberResults.map((item) => item.individualScore), [70, 70, 70]);
assert.deepEqual(evaluation.memberResults.map((item) => item.totalScore), [100, 100, 100]);
assert.equal(evaluation.memberResults.every((item) => item.passed), true);

const brokenReview = evaluateCollaborationEvidence({
  members: [
    { userId: "feature-user", teamRole: "FEATURE_DEVELOPER" },
    { userId: "test-user", teamRole: "TEST_DEVELOPER" },
    { userId: "reviewer-user", teamRole: "CODE_REVIEWER" }
  ],
  events: fullWorkflowEvents.filter((event) => event.eventType !== "REVIEW"),
  issueNumber: 42,
  testEvidence: "FAIL: conflict was unresolved\nPASS: final policy verified\n",
  finalConflict: "AUTH_MODE=secure-verified\nFEATURE_FLAG=enabled\nTEST_GUARD=enabled\n"
});
assert.equal(brokenReview.workflowComplete, false);
assert.equal(brokenReview.memberResults.find((item) => item.role === "CODE_REVIEWER").passed, false);

console.log("Complete Gitea collaboration workflow source and behavior checks passed.");
