import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("public/student-team.js", "utf8");
const terminal = readFileSync("public/sandbox-terminal.js", "utf8");
const terminalHtml = readFileSync("public/sandbox-terminal.html", "utf8");
const terminalCss = readFileSync("public/sandbox-terminal.css", "utf8");
const teamHtml = readFileSync("public/student-team.html", "utf8");
const collaboration = readFileSync("services/collaboration/collaboration-service.js", "utf8");
assert.doesNotMatch(client, /workspace-health/, "Continue workspace should enter the terminal without a blocking Docker health request");
assert.match(client, /existing\?\.status === "RUNNING"[\s\S]*window\.location\.assign\(url\)/,
  "A running workspace should be passed to the terminal without reprovisioning Gitea");
assert.match(terminal, /void loadCollaborationReport\(\)[\s\S]*pendingVerification: true[\s\S]*connectTerminal\(\)/,
  "The signed report should not delay opening the Docker shell");
assert.match(terminal, /xterm\.options\.disableStdin = !connected/,
  "The collaboration terminal must not accept and discard commands before connection is ready");
assert.match(terminal, /dashboard\.href = "student-dashboard\.html"[\s\S]*team\?\.remove\(\)/,
  "Authenticated team header should keep only a dashboard action");
assert.match(terminalHtml, /class="brand" href="home\.html"|class="brand" href="student-dashboard\.html"/,
  "The GitStack header brand must remain present");
assert.match(terminalCss, /html\.team-terminal-route \.nav-links[\s\S]*display:none!important/,
  "The collaboration header must hide the unrelated learning links");
assert.match(terminalCss, /html\.team-terminal-route \.nav-actions \.dashboard-return\{display:inline-flex!important\}/,
  "The collaboration header must keep Dashboard visible, including on mobile");
assert.match(terminalHtml, /<script src="theme\.js"><\/script>/,
  "The existing light/dark toggle must stay available");
assert.match(terminalHtml, /classList\.add\("team-terminal-route"\)/,
  "Landing page auth actions must stay hidden before team navigation is ready");
assert.doesNotMatch(teamHtml, /xterm@|xterm-addon-fit@/,
  "Team Activity should not block on unused terminal assets");
assert.match(collaboration, /fresh_clone=1[\s\S]*if \[ "\$fresh_clone" -eq 0 \]; then/,
  "A new clone must not immediately fetch the same repository a second time");

const tracked = ["GITEA_ADMIN_TOKEN", "GITEA_BASE_URL", "GITEA_WEBHOOK_SECRET", "GITEA_WEBHOOK_TARGET_URL"];
const previous = Object.fromEntries(tracked.map((name) => [name, process.env[name]]));
const oldFetch = globalThis.fetch;
process.env.GITEA_ADMIN_TOKEN = "test-token";
process.env.GITEA_BASE_URL = "http://fake-gitea.local";
process.env.GITEA_WEBHOOK_SECRET = "test-webhook-secret";
process.env.GITEA_WEBHOOK_TARGET_URL = "http://fake-gateway.local/api/gitea/webhook";

const roles = ["FEATURE_DEVELOPER", "TEST_DEVELOPER", "CODE_REVIEWER"];
const branches = ["feature/login-improvement", "test/login-improvement", "review/login-improvement"];
const team = {
  id: "team-1", giteaRepositoryId: 9, giteaOwner: "gitstack", giteaRepository: "team-one",
  giteaTeamId: 17, giteaWebhookId: 31,
  members: roles.map((teamRole, index) => ({
    userId: `student-${index}`, teamRole,
    user: { id: `student-${index}`, role: "STUDENT", isActive: true, giteaUsername: `gitea-${index}` }
  }))
};
const assignment = {
  id: "assignment-1", collaborationPreparedAt: new Date(), giteaIssueNumber: 3,
  missionTemplate: { missionType: "TEAM" }, team
};
const prisma = {
  assignment: { findUnique: async () => assignment },
  missionRun: { findFirst: async () => ({ id: "run-2", teamRole: "CODE_REVIEWER" }) }
};
let memberAccess = true;
let hookActive = true;
let branchComplete = true;
let repoExists = true;
let methods = [];
globalThis.fetch = async (raw, options = {}) => {
  const pathname = new URL(raw).pathname;
  methods.push(options.method || "GET");
  let body;
  if (pathname === "/api/v1/repos/gitstack/team-one") body = { id: 9 };
  else if (pathname === "/api/v1/teams/17/members") body = memberAccess ? [{ login: "gitea-2" }] : [];
  else if (pathname === "/api/v1/repos/gitstack/team-one/hooks") body = [{ id: 31, active: hookActive, config: { url: process.env.GITEA_WEBHOOK_TARGET_URL } }];
  else if (pathname === "/api/v1/repos/gitstack/team-one/branches") body = (branchComplete ? branches : branches.slice(0, 2)).map((name) => ({ name }));
  else throw new Error(`Unexpected Gitea request: ${pathname}`);
  const status = !repoExists && pathname === "/api/v1/repos/gitstack/team-one" ? 404 : 200;
  return { ok: status === 200, status, text: async () => JSON.stringify(body) };
};

try {
  const { preparedStudentAssignment } = await import("../services/collaboration/collaboration-service.js");
  const options = { prisma, assignmentId: assignment.id, user: { id: "student-2", giteaUsername: "gitea-2" } };
  const prepared = await preparedStudentAssignment(options);
  assert.equal(prepared?.team, team, "A fully prepared team should reuse its Gitea setup");
  assert.equal(prepared?.readiness.webhookConfigured, true);
  assert.equal(methods.length, 4, "Prepared workspace must use four parallel read-only Gitea checks");
  assert.ok(methods.every((method) => method === "GET"), "A resume must not mutate a provisioned Gitea repository");

  memberAccess = false;
  assert.equal(await preparedStudentAssignment(options), null, "Revoked student access must require full repair");
  memberAccess = true;
  hookActive = false;
  assert.equal(await preparedStudentAssignment(options), null, "Disabled webhook must require full repair");
  hookActive = true;
  branchComplete = false;
  assert.equal(await preparedStudentAssignment(options), null, "Missing assigned branch must require full repair");
  branchComplete = true;
  repoExists = false;
  assert.equal(await preparedStudentAssignment(options), null, "Deleted repository must require full repair");
} finally {
  globalThis.fetch = oldFetch;
  for (const name of tracked) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
}

console.log("Collaboration resume checks passed: healthy fast path, read-only verification, and safe repair fallback.");
