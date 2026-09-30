import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function source(file) {
  assert.equal(existsSync(file), true, `${file} is missing`);
  return readFileSync(file, "utf8");
}

const collaborationSource = source("services/collaboration/collaboration-service.js");
for (const token of [
  "COLLABORATION_STATE_CONTRACT_VERSION",
  "COLLABORATION_REFRESH_AFTER_MS",
  "buildMemberCollaborationState",
  'source: "shared-assignment-workflow"',
  "reviewFeedback",
  "nextAction",
  "stateVersion"
]) {
  assert.match(collaborationSource, new RegExp(token), `Shared collaboration state is missing ${token}`);
}

const studentRoutes = source("routes/student-routes.js");
const instructorRoutes = source("routes/instructor-routes.js");
assert.match(studentRoutes, /getCollaborationReport\(\{ prisma, assignmentId \}\)/, "Student state is not backed by the shared report service");
assert.match(instructorRoutes, /getCollaborationReport\(\{ prisma, assignmentId: id \}\)/, "Instructor state is not backed by the shared report service");

const studentUi = source("public/student-team.js");
for (const token of [
  "synchronizeTeamActivity",
  "teamStructureSignature",
  "data-assignment-sync",
  "reviewFeedback",
  "run.nextAction",
  "setInterval"
]) assert.match(studentUi, new RegExp(token.replaceAll(".", "\\.")), `Student live bridge is missing ${token}`);

const instructorUi = source("public/instructor-collaboration.js");
for (const token of [
  "collaborationSyncStatus",
  "currentStateVersion",
  "renderSyncStatus",
  "run?.nextAction",
  "reviewFeedback",
  "setInterval"
]) assert.match(instructorUi, new RegExp(token.replaceAll("?", "\\?").replaceAll(".", "\\.")), `Instructor live bridge is missing ${token}`);

const terminalUi = source("public/sandbox-terminal.js");
assert.match(terminalUi, /report\.myRun\?\.branch/, "Terminal does not use the server-assigned branch");
assert.match(terminalUi, /report\.myRun\?\.nextAction/, "Terminal does not show the shared next action");
assert.match(terminalUi, /collaborationRefreshTimer/, "Terminal does not receive live instructor/workflow updates");

const {
  buildCollaborationWorkflow,
  buildMemberCollaborationState
} = await import("../services/collaboration/collaboration-service.js");

const at = (minute) => new Date(`2026-09-21T02:${String(minute).padStart(2, "0")}:00Z`);
const event = (id, eventType, actorUserId, branch, minute, payload = {}) => ({
  id,
  eventType,
  actorUserId,
  branch,
  occurredAt: at(minute),
  payload,
  giteaResourceId: id
});
const featureMember = { userId: "feature-user", teamRole: "FEATURE_DEVELOPER" };
const testMember = { userId: "test-user", teamRole: "TEST_DEVELOPER" };
const reviewerMember = { userId: "reviewer-user", teamRole: "CODE_REVIEWER" };
const runFor = (member, status = "IN_PROGRESS") => ({
  id: `run-${member.userId}`,
  userId: member.userId,
  teamRole: member.teamRole,
  status,
  updatedAt: at(0),
  assessmentResult: null
});
const commitPayload = (message) => ({ commit: { message, modified: ["src/login-policy.txt"] } });

assert.equal(
  buildMemberCollaborationState({ member: featureMember, run: null, events: [], issueNumber: null, prepared: false }).nextAction.code,
  "WAIT_PREPARATION"
);

assert.equal(
  buildMemberCollaborationState({ member: featureMember, run: runFor(featureMember, "NOT_STARTED"), events: [], issueNumber: 3 }).nextAction.code,
  "START_WORKSPACE"
);

const featureEvents = [
  event("fc1", "COMMIT", "feature-user", "feature/login-improvement", 1, commitPayload("Secure the login mode")),
  event("fc2", "COMMIT", "feature-user", "feature/login-improvement", 2, commitPayload("Enable the feature flag")),
  event("fp1", "PUSH", "feature-user", "feature/login-improvement", 3),
  event("fpr", "PULL_REQUEST", "feature-user", "feature/login-improvement", 4)
];
assert.equal(
  buildMemberCollaborationState({ member: featureMember, run: runFor(featureMember), events: featureEvents, issueNumber: 3 }).nextAction.code,
  "WAIT_FEATURE_REVIEW"
);

const requestedEvents = [
  ...featureEvents,
  event("fr1", "REVIEW", "reviewer-user", "feature/login-improvement", 5, { review: { content: "Preserve both feature changes." } }),
  event("fcr", "CHANGES_REQUESTED", "reviewer-user", "feature/login-improvement", 6, { review: { content: "Add a response note before approval." } })
];
const requestedState = buildMemberCollaborationState({ member: featureMember, run: runFor(featureMember), events: requestedEvents, issueNumber: 3 });
assert.equal(requestedState.nextAction.code, "FEATURE_REVIEW_RESPONSE");
assert.equal(requestedState.reviewFeedback.message, "Add a response note before approval.");

const featureUpdatedEvents = [
  ...requestedEvents,
  event("fc3", "COMMIT", "feature-user", "feature/login-improvement", 7, commitPayload("Address requested review changes")),
  event("fp2", "PUSH", "feature-user", "feature/login-improvement", 8)
];
assert.equal(
  buildMemberCollaborationState({ member: featureMember, run: runFor(featureMember), events: featureUpdatedEvents, issueNumber: 3 }).nextAction.code,
  "WAIT_FEATURE_MERGE"
);

const featureMergedEvents = [
  ...featureUpdatedEvents,
  event("fa1", "APPROVAL", "reviewer-user", "feature/login-improvement", 9),
  event("fm1", "MERGE", "reviewer-user", "feature/login-improvement", 10)
];

const testBeforeMergeEvents = [
  ...featureUpdatedEvents,
  event("tc1", "COMMIT", "test-user", "test/login-improvement", 7, commitPayload("Add failing test evidence")),
  event("tp1", "PUSH", "test-user", "test/login-improvement", 8),
  event("tpr", "PULL_REQUEST", "test-user", "test/login-improvement", 9)
];
assert.equal(
  buildMemberCollaborationState({ member: testMember, run: runFor(testMember), events: testBeforeMergeEvents, issueNumber: 3 }).nextAction.code,
  "WAIT_FEATURE_MERGE"
);
assert.equal(
  buildMemberCollaborationState({ member: testMember, run: runFor(testMember), events: [...testBeforeMergeEvents, featureMergedEvents.at(-1)], issueNumber: 3 }).nextAction.code,
  "RESOLVE_CONFLICT"
);

const testResolvedEvents = [
  ...featureMergedEvents,
  ...testBeforeMergeEvents.filter((item) => item.actorUserId === "test-user"),
  event("tc2", "COMMIT", "test-user", "test/login-improvement", 11, commitPayload("Resolve conflict and record passing test")),
  event("tp2", "PUSH", "test-user", "test/login-improvement", 12)
];
assert.equal(
  buildMemberCollaborationState({ member: testMember, run: runFor(testMember), events: testResolvedEvents, issueNumber: 3 }).nextAction.code,
  "WAIT_TEST_APPROVAL"
);

const reviewerBeforeReview = [...featureEvents];
assert.equal(
  buildMemberCollaborationState({ member: reviewerMember, run: runFor(reviewerMember), events: reviewerBeforeReview, issueNumber: 3 }).nextAction.code,
  "REVIEW_FEATURE"
);
assert.equal(
  buildMemberCollaborationState({ member: reviewerMember, run: runFor(reviewerMember), events: requestedEvents, issueNumber: 3 }).nextAction.code,
  "WAIT_FEATURE_UPDATE"
);
assert.equal(
  buildMemberCollaborationState({ member: reviewerMember, run: runFor(reviewerMember), events: featureUpdatedEvents, issueNumber: 3 }).nextAction.code,
  "APPROVE_FEATURE"
);

const completeEvents = [
  ...testResolvedEvents,
  event("ta1", "APPROVAL", "reviewer-user", "test/login-improvement", 13),
  event("tm1", "MERGE", "reviewer-user", "test/login-improvement", 14)
];
assert.equal(
  buildMemberCollaborationState({ member: reviewerMember, run: runFor(reviewerMember), events: completeEvents, issueNumber: 3 }).nextAction.code,
  "REVIEW_COMPLETE"
);

const workflow = buildCollaborationWorkflow([event("issue", "ISSUE", null, null, 0)]);
assert.equal(workflow.nextStep.eventType, "BRANCH");
assert.equal(workflow.complete, false);

console.log("Bidirectional student and instructor collaboration bridge checks passed.");
