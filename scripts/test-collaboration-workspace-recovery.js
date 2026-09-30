import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { getCollaborationWorkspaceHealth } from "../services/collaboration/collaboration-service.js";
import { createTerminalManager } from "../services/sandbox/terminal-manager.js";

const source = (file) => readFileSync(file, "utf8");
const terminalUi = source("public/sandbox-terminal.js");
const terminalManagerSource = source("services/sandbox/terminal-manager.js");
const studentRoutes = source("routes/student-routes.js");
assert.match(studentRoutes, /team\/assignments\/:id\/workspace-health/, "Workspace preflight endpoint is missing");
assert.match(terminalUi, /pendingVerification: true[\s\S]*connectTerminal\(\)/, "A prepared handoff must attempt the authorized terminal immediately");
assert.match(terminalUi, /reconnectCollaborationTerminal\(\{ automatic: true \}\)/, "A stopped collaboration terminal cannot repair itself");
assert.match(terminalUi, /: !exists \|\| !sandbox\.running/, "A stopped individual sandbox cannot be reconnected");
assert.match(terminalManagerSource, /test -d \.git\$\{assignedBranch[\s\S]*\|\|/, "Collaboration terminal must reject a missing Git repository or wrong branch");
assert.match(terminalManagerSource, /collaborationTerminal \? null : sandbox\.mission/, "Team Git commands must not enter the individual mission progress gate");
assert.match(terminalManagerSource, /collaborationTerminal \? "GIT_TERMINAL_PROMPT=1"/, "Student Git push must be able to ask for the student's own token");

const tempDir = mkdtempSync(path.join(os.tmpdir(), "gitstack-collab-recovery-"));
const oldPath = process.env.PATH;
const oldState = process.env.GITSTACK_FAKE_DOCKER_STATE;
const oldLog = process.env.GITSTACK_FAKE_DOCKER_LOG;
const dockerLog = path.join(tempDir, "docker-args.log");
const dockerPath = path.join(tempDir, "docker");
writeFileSync(dockerPath, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.GITSTACK_FAKE_DOCKER_LOG, JSON.stringify(args) + "\\n");
const state = process.env.GITSTACK_FAKE_DOCKER_STATE;
if (args[0] === "ps") {
  if (state !== "gone") process.stdout.write("fake-container-id\\n");
} else if (args[0] === "inspect") {
  const labels = {
    "gitstack.sandbox-id": "sandbox-1", "gitstack.owner-user-id": "student-1",
    "gitstack.mode": "COLLABORATION"
  };
  process.stdout.write(JSON.stringify([{ Id: "fake-container-id", Name: "/gitstack-sandbox-sandbox-1",
    Config: { Labels: labels, User: "10001:10001", WorkingDir: "/workspace" },
    State: { Running: state !== "stopped", Status: state === "stopped" ? "exited" : "running" },
    HostConfig: {} }]) + "\\n");
} else if (args[0] === "exec" && args[1] === "-i") {
  process.stdout.write("\\u001dGITSTACK_META:0|/workspace/team-repo\\u001estudent@gitstack:/workspace/team-repo$ ");
  process.stdin.on("data", (chunk) => {
    if (chunk.toString().includes("\\r")) {
      process.stdout.write("review/login-improvement\\r\\n\\u001dGITSTACK_META:0|/workspace/team-repo\\u001estudent@gitstack:/workspace/team-repo$ ");
    }
  });
} else if (args[0] === "exec") {
  if (state === "missing") { process.stderr.write("fatal: cannot change to '/workspace/team-repo'\\n"); process.exitCode = 128; }
  else process.stdout.write((state === "wrong-branch" ? "main" : "review/login-improvement") + "\\n");
} else { process.stderr.write("Unexpected fake Docker command: " + args.join(" ")); process.exitCode = 1; }
`);
chmodSync(dockerPath, 0o755);
process.env.PATH = `${tempDir}${path.delimiter}${oldPath}`;
process.env.GITSTACK_FAKE_DOCKER_LOG = dockerLog;

const user = { id: "student-1" };
let sessionExpiry = new Date(Date.now() + 60_000);
let missionUpdates = 0;
const prisma = {
  missionRun: {
    findFirst: async () => ({ id: "run-1", teamRole: "CODE_REVIEWER" }),
    updateMany: async () => { missionUpdates += 1; throw new Error("Team terminal must not update individual mission progress."); }
  },
  sandboxSession: {
    findFirst: async () => ({ sandboxId: "sandbox-1", userId: user.id, missionRunId: "run-1", status: "RUNNING", expiresAt: sessionExpiry }),
    findUnique: async () => ({ sandboxId: "sandbox-1", userId: user.id, missionRunId: "run-1", status: "RUNNING", mode: "COLLABORATION", expiresAt: sessionExpiry,
      missionRun: { id: "run-1", progressPercent: 47, status: "IN_PROGRESS", missionTemplate: { slug: "team-collaboration" } } })
  }
};

try {
  for (const [state, ready] of [["healthy", true], ["stopped", false], ["missing", false], ["wrong-branch", false], ["gone", false]]) {
    process.env.GITSTACK_FAKE_DOCKER_STATE = state;
    const result = await getCollaborationWorkspaceHealth({ prisma, assignmentId: "assignment-1", user });
    assert.equal(result.ready, ready, `The ${state} repository health result is incorrect`);
    assert.equal(result.sandboxId, "sandbox-1");
    assert.equal(result.sandbox?.running, state !== "stopped" && state !== "gone");
  }
  sessionExpiry = new Date(Date.now() - 60_000);
  process.env.GITSTACK_FAKE_DOCKER_STATE = "healthy";
  assert.equal((await getCollaborationWorkspaceHealth({ prisma, assignmentId: "assignment-1", user })).ready, false);
  sessionExpiry = new Date(Date.now() + 60_000);

  const messages = [];
  const handlers = new Map();
  const connection = {
    closed: false,
    sendJson: (message) => messages.push(message),
    close: () => { connection.closed = true; },
    on: (name, handler) => handlers.set(name, handler)
  };
  const manager = createTerminalManager({ warn: () => {}, error: () => {} });
  manager.open({
    sandbox: {
      sandboxId: "sandbox-1", containerName: "gitstack-sandbox-sandbox-1", running: true,
      mode: "COLLABORATION", missionRunId: "run-1", missionRunProgressPercent: 47,
      missionRunTeamRole: "CODE_REVIEWER",
      mission: { slug: "team-collaboration", instructions: { steps: [] } }
    }, connection, prisma
  });
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error("Fake collaboration shell did not open")), 5000);
    const poll = () => {
      if (messages.some((item) => item.type === "status" && item.status === "connected")) {
        clearTimeout(deadline);
        resolve();
      } else setTimeout(poll, 10);
    };
    poll();
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  handlers.get("message")(JSON.stringify({ type: "input", data: "git branch\r" }));
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error("Collaboration command did not reach the raw shell")), 3000);
    const poll = () => {
      if (messages.some((item) => item.type === "output" && item.data.includes("review/login-improvement"))) {
        clearTimeout(deadline);
        resolve();
      } else setTimeout(poll, 10);
    };
    poll();
  });
  assert.equal(missionUpdates, 0, "Collaboration shell rewrote team progress as an individual mission");
  const calls = readFileSync(dockerLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const shellArgs = calls.find((args) => args[0] === "exec" && args[1] === "-i");
  assert.ok(shellArgs, "A collaboration terminal was never started");
  assert.ok(shellArgs.includes("GIT_TERMINAL_PROMPT=1"));
  assert.ok(shellArgs.some((arg) => arg.includes("cd /workspace/team-repo") && arg.includes("test -d .git")));
  assert.ok(shellArgs.some((arg) => arg.includes('test "$(git branch --show-current)" = "review/login-improvement"')),
    "A continued terminal must reject another student's branch before accepting input");
  manager.close("sandbox-1");
} finally {
  process.env.PATH = oldPath;
  if (oldState === undefined) delete process.env.GITSTACK_FAKE_DOCKER_STATE;
  else process.env.GITSTACK_FAKE_DOCKER_STATE = oldState;
  if (oldLog === undefined) delete process.env.GITSTACK_FAKE_DOCKER_LOG;
  else process.env.GITSTACK_FAKE_DOCKER_LOG = oldLog;
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("Collaboration workspace recovery passed: live clone, stopped sandbox, missing repository, branch mismatch, student token prompt and team progress isolation.");
