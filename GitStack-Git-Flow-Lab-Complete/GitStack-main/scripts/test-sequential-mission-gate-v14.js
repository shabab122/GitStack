import { evaluateSequentialMissionCommand } from "../services/student/mission-terminal-policy.js";

const mission = {
  title: "Mistake Recovery",
  steps: [
    "Enter recovery-lab and inspect git status / git diff",
    "Restore notes.txt to its committed version",
    "Create recovery-note.md describing what you learned",
    "Stage and commit recovery-note.md",
    "Finish with a clean working tree"
  ]
};

function ok(command, completedSteps) {
  const r = evaluateSequentialMissionCommand({ mission, command, completedSteps });
  if (!r.allowed) throw new Error(`Expected allowed: ${command}: ${r.message}`);
}
function blocked(command, completedSteps) {
  const r = evaluateSequentialMissionCommand({ mission, command, completedSteps });
  if (r.allowed) throw new Error(`Expected blocked: ${command}`);
}

ok("cd recovery-lab", 0);
ok("git status", 0);
ok("git diff", 0);
blocked("git push", 0);
blocked("git commit -m test", 0);
ok("git restore notes.txt", 1);
blocked("git push", 1);
ok("touch recovery-note.md", 2);
ok("git add recovery-note.md", 3);
ok('git commit -m "Add recovery note"', 3);
ok("git status", 4);
blocked("git push", 4);

console.log("v14 sequential mission gate regression test passed.");

// Regression: Mistake Recovery Step 1 must intercept a valid but out-of-sequence
// git commit and return the exact mission-aware BLOCKED guidance instead of
// allowing Git to fail with "not a git repository".
{
  const mission = { steps: [
    "Enter recovery-lab and inspect git status / git diff",
    "Restore notes.txt to its committed version",
    "Create recovery-note.md describing what you learned",
    "Stage and commit recovery-note.md",
    "Finish with a clean working tree"
  ]};
  const r = evaluateSequentialMissionCommand({
    mission,
    command: 'git commit -m "Added"',
    completedSteps: 0
  });
  if (r.allowed !== false || r.code !== "VALID_BUT_OUT_OF_SEQUENCE") {
    throw new Error(`Mistake Recovery regression failed: ${JSON.stringify(r)}`);
  }
  if (!r.message.includes("[GitStack] BLOCKED: Complete Step 1 first:")) {
    throw new Error(`Missing Step 1 BLOCKED guidance: ${r.message}`);
  }
}
