import fs from "node:fs";
import {
  missionPromptCommandEnv,
  parseTerminalCommandCompletion
} from "../services/sandbox/terminal-command-completion.js";
import { evaluateMissionCommand } from "../services/student/mission-step-engine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mission(slug, steps, validationRules = {}, workspace = "/workspace") {
  return { slug, title: slug, instructions: { workspace, steps }, validationRules };
}

function expect(m, step, command, decision = "execute-and-validate") {
  const result = evaluateMissionCommand({ mission: m, command, completedSteps: step });
  assert(
    result.decision === decision,
    `${m.slug} step ${step + 1}: ${command} -> ${result.decision}/${result.code}; expected ${decision}`
  );
  return result;
}

// Prompt metadata parser must survive chunk boundaries and expose the REAL exit
// code/cwd that arrives only after Bash finishes the command.
const marker = "\u001dGITSTACK_META:0|/workspace/remote-lab\u001e";
let parsed = parseTerminalCommandCompletion("", `Already up to date.\r\n${marker.slice(0, 15)}`);
assert(parsed.output === "Already up to date.\r\n", "normal command output was damaged");
assert(parsed.events.length === 0, "partial marker emitted too early");
parsed = parseTerminalCommandCompletion(parsed.carry, `${marker.slice(15)}student@gitstack:/workspace/remote-lab$ `);
assert(parsed.events.length === 1, "completion event was not reconstructed across chunks");
assert(parsed.events[0].exitCode === 0, "completion exit code lost");
assert(parsed.events[0].cwd === "/workspace/remote-lab", "completion cwd lost");
assert(parsed.output.includes("student@gitstack:/workspace/remote-lab$ "), "real prompt was not preserved");
assert(missionPromptCommandEnv().includes("GITSTACK_META"), "prompt completion env is missing");

// 1) Remote Workflow screenshot: successful pull/push commands are relevant.
const remote = mission("remote-workflow", [
  "Clone the prepared local remote repository /tmp/gitstack-origin.git into remote-lab",
  "Create update.txt",
  "Stage and commit the file",
  "Run git pull origin main",
  "Push your latest main branch to origin"
], { requiredRemotePath: "/tmp/gitstack-origin.git" }, "/workspace/remote-lab");
expect(remote, 3, "git pull origin main");
expect(remote, 4, "git push origin main");

// 2) Branching & Merge screenshot: final history inspection is a relevant final action.
const branching = mission("branching", [
  "Enter the prepared branch-lab repository",
  "Create a branch whose name starts with feature/",
  "Create profile.html and commit it on the feature branch",
  "Switch back to main",
  "Merge the feature branch into main",
  "Verify the final repository history"
], { requiredBranchPrefix: "feature/" }, "/workspace/branch-lab");
expect(branching, 5, "git log --oneline --graph --all");
expect(branching, 5, "git show --stat");

// 3) Feature Branch Development screenshot: main may not exist because the first
// commit was made on the feature branch. Main setup is allowed within the merge
// step, but the step itself still requires a merge action to complete.
const feature = mission("feature-branch-development", [
  "Initialize a new Git repository",
  "Create the required project documentation file",
  "Create and switch to a feature branch",
  "Add and commit feature changes with meaningful messages",
  "Merge the completed feature into the main branch",
  "Verify the final repository history"
], { requiredBranchPrefix: "feature/" });
expect(feature, 4, "git branch main");
expect(feature, 4, "git switch -c main");
expect(feature, 4, "git switch main");
expect(feature, 4, "git merge feature/log");
expect(feature, 4, "git branch other", "block");
expect(feature, 4, "git branch -M main", "block");

// 4) Commit Recovery screenshot: the correct restore syntax is admitted for the
// active recovery step. Runtime state verification now decides whether it really
// restored the previous known-good version.
const recovery = mission("commit-recovery-challenge", [
  "Initialize the repository and create the required project file",
  "Create an initial commit containing the working project state",
  "Make and commit a second change to the project",
  "Inspect the commit history and identify the previous working state",
  "Safely recover the required file without deleting the existing commit history",
  "Create a recovery commit with a meaningful message",
  "Verify that the working tree is clean and the recovered project is correct"
], { requiredFile: "project.md", minimumCommits: 3, cleanWorkingTree: true });
expect(recovery, 4, "git restore --source=HEAD~1 -- project.md");
expect(recovery, 4, "git restore --source=HEAD -- other.md", "block");

// 5) Collaborative workflow screenshot: branch creation is the correct Step 2 action.
const collaborative = mission("collaborative-feature-development", [
  "Initialize the project repository and prepare it for development work",
  "Create a separate development workflow for the assigned feature",
  "Implement the required project changes",
  "Track and review your modifications before saving your progress",
  "Create meaningful commits that explain your completed work",
  "Prepare your changes for team review and integration"
], { requiredBranchPrefix: "feature/", minimumCommits: 1, cleanWorkingTree: true });
expect(collaborative, 1, "git switch -c feature/project-update");
expect(collaborative, 1, "git checkout -b feature/login");
expect(collaborative, 1, "git switch -c wrong/project", "block");

// Source wiring guards: evidence is now recorded only after a successful shell
// completion marker, not before command execution or on timer guesses.
const manager = fs.readFileSync("services/sandbox/terminal-manager.js", "utf8");
assert(manager.includes("handleShellCompletion"), "terminal completion handler is missing");
assert(manager.includes("exitCode === 0 && pending.gate.decision === \"execute-and-validate\""),
  "failed commands can still become mission evidence");
assert(!manager.includes("for (const delay of [180, 450, 900])"), "old fixed-timer validation race still exists");
assert(manager.includes("getMissionStepCount"), "resumed mission step is not initialized synchronously");

const policy = fs.readFileSync("services/student/mission-terminal-policy.js", "utf8");
assert(policy.includes('["git", "rev-list", "HEAD~1"]'),
  "recovery step does not inspect previous reachable commit states");
assert(policy.includes('["git", "diff", "--quiet", hash, "--", recoveryFile]'),
  "recovery step does not compare the recovered file with a previous known-good state");

console.log("v29 runtime command-completion regression test passed.");
