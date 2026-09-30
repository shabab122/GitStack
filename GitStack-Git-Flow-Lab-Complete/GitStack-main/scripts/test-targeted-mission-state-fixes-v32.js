import fs from "node:fs";
import {
  evaluateMissionCommand
} from "../services/student/mission-step-engine.js";
import {
  getMissionStepCount
} from "../services/student/mission-terminal-policy.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mission(slug, steps, validationRules = {}, workspace = "/workspace") {
  return { slug, instructions: { workspace, steps }, validationRules };
}

// 1) Branching & Merge: the real published template shown by the user has five
// visible steps. It must not inherit a hidden sixth history checkpoint.
const oldBranching = mission("branching", [
  "Enter the prepared branch-lab repository",
  "Create a branch whose name starts with feature/",
  "Create profile.html and commit it on the feature branch",
  "Switch back to main",
  "Merge the feature branch into main"
], { requiredBranchPrefix: "feature/" }, "/workspace/branch-lab");

assert(getMissionStepCount("branching", oldBranching) === 5,
  "five-step Branching mission still receives a hidden sixth step");

const mergeGate = evaluateMissionCommand({
  mission: oldBranching,
  command: "git merge feature/login",
  completedSteps: 4
});
assert(mergeGate.decision === "execute-and-validate",
  "Branching merge command is not accepted for the final visible step");

// Newer six-step templates may explicitly require history inspection.
const newBranching = mission("branching", [
  ...oldBranching.instructions.steps,
  "Verify the final repository history"
], { requiredBranchPrefix: "feature/" }, "/workspace/branch-lab");
assert(getMissionStepCount("branching", newBranching) === 6,
  "explicit Branching history step was lost");
const logGate = evaluateMissionCommand({
  mission: newBranching,
  command: "git log --oneline --graph --all",
  completedSteps: 5
});
assert(logGate.decision === "execute-and-validate",
  "explicit Branching history command is not accepted");

// 2) Commit Recovery: correct restore syntax remains admitted.
const recovery = mission("commit-recovery-challenge", [
  "Initialize the repository and create the required project file",
  "Create an initial commit containing the working project state",
  "Make and commit a second change to the project",
  "Inspect the commit history and identify the previous working state",
  "Safely recover the required file without deleting the existing commit history",
  "Create a recovery commit with a meaningful message",
  "Verify that the working tree is clean and the recovered project is correct"
], { requiredFile: "project.md", minimumCommits: 3, cleanWorkingTree: true });

for (const command of [
  "git restore --source=HEAD~1 -- project.md",
  "git restore --source=abc123 -- project.md"
]) {
  const gate = evaluateMissionCommand({ mission: recovery, command, completedSteps: 4 });
  assert(gate.decision === "execute-and-validate",
    `valid recovery command blocked: ${command}`);
}

// 3) Collaborative Feature Development: the correct feature-branch command is
// still the expected Step 2 action.
const collaborative = mission("collaborative-feature-development", [
  "Initialize the project repository and prepare it for development work",
  "Create a separate development workflow for the assigned feature",
  "Implement the required project changes",
  "Track and review your modifications before saving your progress",
  "Create meaningful commits that explain your completed work",
  "Prepare your changes for team review and integration"
], { requiredBranchPrefix: "feature/", minimumCommits: 1, cleanWorkingTree: true });

for (const command of [
  "git switch -c feature/project-update",
  "git checkout -b feature/login"
]) {
  const gate = evaluateMissionCommand({ mission: collaborative, command, completedSteps: 1 });
  assert(gate.decision === "execute-and-validate",
    `valid collaborative branch command blocked: ${command}`);
}

// Source-level guards for the three runtime-state fixes.
const policy = fs.readFileSync("services/student/mission-terminal-policy.js", "utf8");

assert(policy.includes('const configuredSteps = missionSteps(mission);'),
  "Branching state is not driven by the actual visible mission steps");
assert(policy.includes('const historyIndex = configuredSteps.findIndex'),
  "Branching state does not detect an explicit history step dynamically");
assert(policy.includes('["git", "rev-list", "HEAD~1"]'),
  "Commit Recovery does not inspect earlier reachable commits");
assert(policy.includes('["git", "diff", "--quiet", hash, "--", recoveryFile]'),
  "Commit Recovery does not validate the restored file against earlier history");
assert(!policy.includes('if (!(session.recoveryPerformed || session.recoveryAttempted))'),
  "Commit Recovery still depends on volatile in-memory recovery evidence");
assert(policy.includes("return branchReady;"),
  "Collaborative branch step still depends on volatile terminal-session flags");

console.log("v32 targeted mission-state regression test passed.");
