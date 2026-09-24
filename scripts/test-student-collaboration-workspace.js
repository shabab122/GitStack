import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  classifyDockerFailure,
  sanitizeDockerDiagnostic
} from "../services/sandbox/docker-client.js";

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
assert.match(team, /prepared=1/, "Team Activity does not mark its completed workspace handoff");
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
assert.match(terminal, /\/api\/student\/team\/assignments\/\$\{encodeURIComponent\(queryAssignment\)\}\/start/, "Terminal does not restore the assigned repository clone safely");
assert.match(terminal, /collaborationSandboxId/, "Terminal can select a collaboration sandbox from the report");
assert.match(terminal, /ensureCollaborationWorkspace: collaborationMode/, "Terminal load does not repair a missing collaboration clone");
assert.match(terminal, /terminalSocketIsActive/, "Terminal reconnects are not guarded against duplicate sessions");
assert.match(terminal, /skipInitialWorkspaceStart/, "Terminal repeats assignment start after Team Activity already prepared the sandbox");
assert.match(terminal, /!querySandbox \|\| !skipInitialWorkspaceStart/, "Reloaded collaboration terminals do not revalidate the temporary repository");
assert.match(terminal, /history\.replaceState/, "Terminal does not keep the URL synchronized with the prepared sandbox");
assert.match(terminal, /currentSandbox\?\.sandboxId[\s\S]*querySandbox/, "Terminal refresh can switch away from the active sandbox");
assert.match(terminal, /authenticationRequired = error\.status === 401/, "Docker failures are incorrectly presented as login failures");
assert.doesNotMatch(terminal, /data:\s*["']cd \/workspace\/team-repo/, "Terminal must not execute collaboration commands automatically");
assert.match(terminal, /elements\.startButton[\s\S]*collaborationMode[\s\S]*prepareCollaborationWorkspace/, "Restarting a collaboration sandbox does not restore its temporary repository");
assert.match(terminal, /Temporary and unpushed workspace files will be removed/, "Stopping a collaboration tmpfs workspace does not warn about unpushed data loss");
assert.doesNotMatch(terminal, /Files remain until reset, delete or expiry/, "The terminal must not claim tmpfs files survive a container stop");

const terminalManager = source("services/sandbox/terminal-manager.js");
assert.doesNotMatch(terminalManager, /child\.stdin\.write\(`stty/, "Terminal resize must not inject a visible stty command");
assert.match(terminalManager, /session\.columns = columns/, "Validated terminal dimensions are not retained");
assert.doesNotMatch(terminalManager, /child\.on\("spawn"[\s\S]{0,200}status: "connected"/, "Terminal must not report Connected before the shell emits output");
// assert.match(terminalManager, /confirmsReady: true/, "Terminal readiness is not confirmed from shell output");
assert.match(
  terminalManager,
  /initialPromptSeen/,
  "Terminal startup synchronization state is missing"
);

assert.match(
  terminalManager,
  /completionType === "startup"/,
  "Terminal readiness is not confirmed from the initial shell prompt"
);

assert.match(
  terminalManager,
  /markReady\(\)/,
  "Terminal does not mark the session ready after startup synchronization"
);

assert.match(terminalManager, /TERMINAL_START_TIMEOUT/, "Terminal startup cannot recover from a hanging Docker exec");

const studentRoutes = source("routes/student-routes.js");
for (const suffix of ["start", "report", "assess"]) {
  assert.match(studentRoutes, new RegExp(`team/assignments/:id/${suffix}`), `Student ${suffix} route is missing`);
}
assert.match(studentRoutes, /teamId: membership\.teamId/, "Student assignment routes are not scoped to team membership");

const sandboxRoutes = source("routes/sandbox-routes.js");
assert.match(sandboxRoutes, /COLLABORATION_START_ROUTE_REQUIRED/, "The generic sandbox start route can bypass collaboration repository restoration");

const collaboration = source("services/collaboration/collaboration-service.js");
assert.match(collaboration, /STUDENT_GITEA_ACCESS_REQUIRED/, "Workspace start does not enforce linked Gitea access");
assert.match(collaboration, /ensureDefaultGiteaSandboxNetwork/, "Workspace start does not prepare Gitea-to-sandbox networking");
assert.match(collaboration, /git remote set-url origin/, "Student remote is not stripped of the service credential after cloning");
assert.match(collaboration, /test "\$\(git branch --show-current\)"/, "Assigned branch is not verified before returning the workspace");
assert.match(collaboration, /withWorkspaceStartLock/, "Concurrent workspace starts are not serialized");
assert.match(collaboration, /runWorkspacePreparation/, "Transient idempotent workspace setup failures are not retried once");
assert.match(collaboration, /flock -w 30/, "Repository preparation is not locked inside the sandbox");
assert.match(collaboration, /mktemp -d \/workspace\/\.team-repo-preparing/, "Repository clone is not prepared atomically");
assert.match(collaboration, /mv "\$prepare_dir" team-repo/, "Prepared repository is not installed atomically");
assert.doesNotMatch(collaboration, /git clone[^\n]+\s+team-repo\s/, "Repository must not be cloned directly into the live workspace path");
assert.match(collaboration, /git remote set-url origin \$\{shellQuote\(serviceCloneUrl\)\}/, "Existing clones cannot authenticate while fetching repaired role branches");
assert.match(collaboration, /trap clean_remote EXIT/, "The temporary authenticated remote is not protected by a cleanup trap");
assert.match(collaboration, /git remote get-url origin/, "The credential-free remote is not verified before workspace handoff");
assert.doesNotMatch(collaboration, /git fetch origin --prune >\/dev\/null 2>&1 \|\| true/, "Repository fetch failures must not be silently ignored");

const redacted = sanitizeDockerDiagnostic("fatal: https://admin:top-secret@gitstack-gitea/repo.git?token=hidden-token GITEA_ADMIN_TOKEN=another-secret");
assert.doesNotMatch(redacted, /top-secret|hidden-token|another-secret/, "Docker diagnostics expose repository credentials or tokens");
const missingContainer = classifyDockerFailure({ stderr: "Error: No such container: missing", args: ["exec"], exitCode: 1 });
assert.equal(missingContainer.code, "DOCKER_CONTAINER_NOT_FOUND");

const imageService = source("services/sandbox/image-service.js");
assert.match(imageService, /SANDBOX_IMAGE_OUTDATED/, "Stale cached sandbox images are accepted without a rebuild");
const projectStart = source("scripts/start-project.js");
assert.match(projectStart, /SANDBOX_IMAGE_SCHEMA_VERSION/, "Normal project startup does not rebuild an outdated sandbox image");

const network = source("services/sandbox/network-service.js");
assert.match(network, /ensureCollaborationNetworkPeer/, "Collaboration network peer repair is missing");
assert.match(network, /"network",\s*"connect"/, "Gitea is not connected to the private collaboration network");

const compose = source("docker-compose.yml");
assert.match(compose, /gitea:[\s\S]*gitstack_sandbox_network/, "Gitea Compose service is not attached to the student collaboration network");

console.log("Student collaboration workspace, role workflow, terminal handoff and instructor evidence checks passed.");
