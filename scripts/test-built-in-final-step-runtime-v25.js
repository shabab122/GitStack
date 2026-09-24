import fs from "node:fs";
import {
  evaluateSequentialMissionCommand,
  observeMissionCommand
} from "../services/student/mission-terminal-policy.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const gitBasics = {
  slug: "git-basics",
  instructions: {
    steps: [
      "Run git init",
      "Create profile.html",
      "Stage profile.html with git add",
      "Commit it with a meaningful message",
      "Use git status and git log to review your work"
    ]
  }
};

// The exact final-step commands shown in the runtime screenshot must both be
// recognized as relevant rather than blocked/ignored.
for (const command of ["git status", "git log", "git log --oneline --graph --all"]) {
  const r = evaluateSequentialMissionCommand({
    mission: gitBasics,
    command,
    completedSteps: 4
  });
  assert(r.decision === "execute-and-validate", `${command} is not accepted for Git Basics Step 5`);
}

// Passive action evidence must record both parts of the final review.
const basicsSession = { cwd: "/workspace" };
observeMissionCommand({
  missionSlug: "git-basics",
  command: "git status",
  session: basicsSession,
  mission: gitBasics
});
assert(basicsSession.statusInspected === true, "git status evidence was not recorded");

observeMissionCommand({
  missionSlug: "git-basics",
  command: "git log --oneline --graph --all",
  session: basicsSession,
  mission: gitBasics
});
assert(basicsSession.historyInspected === true, "git log evidence was not recorded");

// Existing built-in action checkpoints must use this same observer path.
const branchSession = { cwd: "/workspace/branch-lab" };
observeMissionCommand({
  missionSlug: "branching",
  command: "git log --oneline --graph --all",
  session: branchSession
});
assert(branchSession.verifiedHistory === true, "Branching history verification evidence missing");

const remoteSession = { cwd: "/workspace/remote-lab" };
observeMissionCommand({
  missionSlug: "remote-workflow",
  command: "git pull origin main",
  session: remoteSession
});
assert(remoteSession.pullCompleted === true, "Remote pull evidence missing");

const recoverySession = { cwd: "/workspace/recovery-lab" };
observeMissionCommand({
  missionSlug: "mistake-recovery",
  command: "git status",
  session: recoverySession
});
assert(recoverySession.inspected === true, "Recovery inspection evidence missing");

// Source-level guard for the off-by-one bug that caused passed=true + 80%.
const source = fs.readFileSync("services/student/mission-terminal-policy.js", "utf8");
assert(source.includes("async function gitBasicsState(sandboxId, session)"),
  "Git Basics state is not session-aware");
assert(source.includes("!session?.statusInspected || !session?.historyInspected"),
  "Git Basics final review does not require both review actions");
assert(source.includes('return result(true, 5, "Mission steps complete")'),
  "Git Basics completion does not mark all five steps complete");
assert(source.includes("const completedSteps = statePassed"),
  "Passed-state progress invariant is missing");

console.log("v25 built-in final-step runtime regression test passed.");
