import fs from "node:fs";
import { evaluateMissionCommand } from "../services/student/mission-step-engine.js";
import { observeMissionCommand } from "../services/student/mission-terminal-policy.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const mission = {
  slug: "branching",
  instructions: {
    workspace: "/workspace/branch-lab",
    steps: [
      "Enter the prepared branch-lab repository",
      "Create a branch whose name starts with feature/",
      "Create profile.html and commit it on the feature branch",
      "Switch back to main",
      "Merge the feature branch into main",
      "Verify the final repository history"
    ]
  },
  validationRules: { requiredBranchPrefix: "feature/" }
};

const gate = evaluateMissionCommand({ mission, command: "cd branch-lab", completedSteps: 0 });
assert(gate.decision === "execute-and-validate", "cd branch-lab must be accepted for Step 1");

const session = { cwd: "/workspace", completedSteps: 0, stepEvidence: {} };
observeMissionCommand({
  missionSlug: "branching",
  command: "cd branch-lab",
  session,
  mission,
  stepIndex: 0,
  commandInfo: gate.command
});
assert(session.cwd === "/workspace/branch-lab", `observer cwd wrong: ${session.cwd}`);

const manager = fs.readFileSync("services/sandbox/terminal-manager.js", "utf8");
const handlerStart = manager.indexOf("const handleShellCompletion = async");
const handlerEnd = manager.indexOf("const forwardShellStdout =", handlerStart);
const handler = manager.slice(handlerStart, handlerEnd);
const observePos = handler.indexOf("observeMissionCommand({");
const authoritativePos = handler.indexOf("if (completedCwd) session.cwd = completedCwd;", observePos);
assert(observePos >= 0, "observeMissionCommand missing from completion handler");
assert(authoritativePos > observePos, "authoritative Bash cwd is not applied after observation");
assert(!handler.includes('session.cwd = cwd.replace(/\\/+$/, "") || "/workspace";'), "old pre-observation cwd assignment still present");

console.log("v31 Branching cwd synchronization regression test passed.");
