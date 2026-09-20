import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function source(file) {
  assert.equal(existsSync(file), true, `${file} is missing`);
  return readFileSync(file, "utf8");
}

const common = source("public/student-common.js");
assert.match(common, /function roleLabel\(/, "Student role label helper is missing");
for (const label of ["Feature Developer", "Test Developer", "Code Reviewer"]) {
  assert.match(common, new RegExp(label), `Student role helper is missing ${label}`);
}
assert.match(common, /function safeExternalUrl\(/, "Student external links are not protocol-checked");

const teamHtml = source("public/student-team.html");
assert.match(teamHtml, /id="teamRoot"/);
assert.match(teamHtml, /src="student-common\.js"[\s\S]*src="student-team\.js"/);

const team = source("public/student-team.js");
for (const branch of ["feature/login-improvement", "test/login-improvement", "review/login-improvement"]) {
  assert.match(team, new RegExp(branch.replaceAll("/", "\\/")), `Student workspace is missing ${branch}`);
}
for (const action of ["Start collaboration workspace", "Refresh progress", "Check workflow", "View report"]) {
  assert.match(team, new RegExp(action), `Student collaboration action is missing: ${action}`);
}
assert.match(team, /collaboration=1&assignment=/, "Workspace redirect does not retain its assignment context");
assert.match(team, /\/api\/student\/team\/assignments\/\$\{assignmentId\}\/start/);
assert.match(team, /\/api\/student\/team\/assignments\/\$\{assignmentId\}\/assess/);
assert.match(team, /\/api\/student\/team\/assignments\/\$\{assignmentId\}\/report/);
assert.match(team, /renderWorkflow\(report\.workflow\)/, "Student view does not render the instructor workflow evidence");
assert.match(team, /personal access token/, "Student push authentication guidance is missing");
assert.match(team, /never use the instructor token/i, "Student UI must forbid instructor-token reuse");

const terminalHtml = source("public/sandbox-terminal.html");
for (const id of [
  "collaborationContext",
  "collaborationRole",
  "collaborationBranch",
  "collaborationIssue",
  "collaborationProgress",
  "refreshCollaborationButton",
  "assessCollaborationButton"
]) {
  assert.match(terminalHtml, new RegExp(`id=["']${id}["']`), `Collaboration terminal is missing #${id}`);
}

const terminal = source("public/sandbox-terminal.js");
assert.match(terminal, /queryParams\.get\("assignment"\)/, "Terminal does not resolve its assignment");
assert.match(terminal, /loadCollaborationReport/, "Terminal does not load signed collaboration evidence");
assert.match(terminal, /\/api\/student\/team\/assignments\/\$\{queryAssignment\}\/assess/);
assert.match(terminal, /\/api\/student\/team\/assignments\/\$\{queryAssignment\}\/start/, "Reset does not restore the assigned repository clone");
assert.match(terminal, /collaborationSandboxId/, "Terminal can select a collaboration sandbox from the report");

const studentRoutes = source("routes/student-routes.js");
for (const suffix of ["start", "report", "assess"]) {
  assert.match(studentRoutes, new RegExp(`team/assignments/:id/${suffix}`), `Student ${suffix} route is missing`);
}
assert.match(studentRoutes, /teamId: membership\.teamId/, "Student assignment routes are not scoped to team membership");

const collaboration = source("services/collaboration/collaboration-service.js");
assert.match(collaboration, /STUDENT_GITEA_ACCESS_REQUIRED/, "Workspace start does not enforce linked Gitea access");
assert.match(collaboration, /ensureDefaultGiteaSandboxNetwork/, "Workspace start does not prepare Gitea-to-sandbox networking");
assert.match(collaboration, /git remote set-url origin/, "Student remote is not stripped of the service credential after cloning");
assert.match(collaboration, /test "\$\(git branch --show-current\)"/, "Assigned branch is not verified before returning the workspace");

const network = source("services/sandbox/network-service.js");
assert.match(network, /ensureCollaborationNetworkPeer/, "Collaboration network peer repair is missing");
assert.match(network, /"network",\s*"connect"/, "Gitea is not connected to the private collaboration network");

const compose = source("docker-compose.yml");
assert.match(compose, /gitea:[\s\S]*gitstack_sandbox_network/, "Gitea Compose service is not attached to the student collaboration network");

console.log("Student collaboration workspace, role workflow, terminal handoff and instructor evidence checks passed.");
