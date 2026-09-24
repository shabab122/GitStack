import fs from "node:fs";
import {
  evaluateMissionCommand,
  compileStep,
  branchRequirementSatisfied
} from "../services/student/mission-step-engine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mission(slug, steps, validationRules = {}, workspace = "/workspace") {
  return { slug, instructions: { workspace, steps }, validationRules };
}

function expect(m, step, command, decision = "execute-and-validate") {
  const result = evaluateMissionCommand({ mission: m, command, completedSteps: step });
  assert(
    result.decision === decision,
    `${m.slug} step ${step + 1}: ${command} => ${result.decision}/${result.code}; expected ${decision}`
  );
  return result;
}

// Screenshot 1/4: Remote Workflow.
// Only the prepared local repository is the right source for this step.
const remote = mission(
  "remote-workflow",
  [
    "Clone the prepared local remote repository into remote-lab",
    "Create update.txt",
    "Stage and commit the file",
    "Run git pull origin main",
    "Push your latest main branch to origin"
  ],
  { requiredRemotePath: "/tmp/gitstack-origin.git" },
  "/workspace/remote-lab"
);
expect(remote, 0, "git clone /tmp/gitstack-origin.git remote-lab");
expect(remote, 0, "git clone https://gitea.gitstack.local/team-alpha/login-project.git remote-lab", "block");
expect(remote, 0, "git clone /var/lib/gitstack/remote-repo.git remote-lab", "block");
expect(remote, 0, "git clone /tmp/gitstack-origin.git wrong-dir", "block");

// Screenshot 2: instructor-created documentation step.
// It must accept a sensible file command even if the prose does not spell out a filename.
const genericDocs = mission(
  "feature-branch-development",
  [
    "Initialize a new Git repository",
    "Create the required project documentation file",
    "Create and switch to a feature branch"
  ],
  {},
  "/workspace"
);
expect(genericDocs, 1, "touch project.md");
expect(genericDocs, 1, 'echo "# Project" > README.md');

// When an instructor DID configure an exact file, that requirement remains authoritative.
const exactDocs = mission(
  "feature-branch-development-exact",
  ["Run git init", "Create the required project documentation file"],
  { requiredFile: "project.md" }
);
expect(exactDocs, 1, "touch project.md");
expect(exactDocs, 1, "touch other.md", "block");

// Screenshot 3: unfinished Branching & Merge will resume in branch-lab.
// Correct merge remains a valid Step 5 action.
const branching = mission(
  "branching",
  [
    "Enter the prepared branch-lab repository",
    "Create a branch whose name starts with feature/",
    "Create profile.html and commit it on the feature branch",
    "Switch back to main",
    "Merge the feature branch into main",
    "Verify the final repository history"
  ],
  { requiredBranchPrefix: "feature/" },
  "/workspace/branch-lab"
);
expect(branching, 4, "git merge feature/login");

// Screenshot 5: branch creation on an unborn repository must count.
// `git switch -c feature/hi` changes HEAD even before the first commit creates refs/heads/*.
assert(
  branchRequirementSatisfied({
    current: "feature/hi",
    branches: [],
    rule: { prefix: "feature/" }
  }) === true,
  "unborn feature branch is not recognized"
);
assert(
  branchRequirementSatisfied({
    current: "main",
    branches: [],
    rule: { prefix: "feature/" }
  }) === false,
  "main incorrectly satisfies feature branch requirement"
);

// Navigation should remain usable even while another step is active.
expect(branching, 4, "cd branch-lab");

// Hidden exact constraints are surfaced in the checklist rather than only failing later.
const studentMission = fs.readFileSync("public/student-mission.js", "utf8");
assert(studentMission.includes("visibleStepText"), "UI constraint display helper missing");
assert(studentMission.includes("requiredRemotePath"), "remote source is not surfaced in mission UI");
assert(studentMission.includes("requiredFile"), "required file is not surfaced in mission UI");

// Resume logic must align the REAL shell cwd with the mission workspace.
const terminalManager = fs.readFileSync("services/sandbox/terminal-manager.js", "utf8");
assert(terminalManager.includes("resumeProgress > 0 ? safeMissionWorkspace"), "resume workdir selection missing");
assert(terminalManager.includes('cd "${startWorkdir}" 2>/dev/null || cd /workspace'), "real shell does not resume in mission workspace");

// Existing runs re-check environment dependencies without resetting learner work.
const setup = fs.readFileSync("services/student/mission-setup-service.js", "utf8");
const routes = fs.readFileSync("routes/student-routes.js", "utf8");
assert(setup.includes("ensureMissionWorkspace"), "mission environment ensure helper missing");
assert(routes.includes("ensureMissionWorkspace"), "existing mission runs do not ensure dependencies");

console.log("v28 runtime mission fixes regression test passed.");
