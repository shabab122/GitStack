import fs from "node:fs";
import {
  classifyTerminalCompletionEvent,
  parseTerminalCommandCompletion
} from "../services/sandbox/terminal-command-completion.js";
import { evaluateMissionCommand } from "../services/student/mission-step-engine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const branching = {
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

const gate = evaluateMissionCommand({
  mission: branching,
  command: "cd branch-lab",
  completedSteps: 0
});
assert(gate.decision === "execute-and-validate", "cd branch-lab must be accepted for Step 1");

// Old race: a first command is already pending when the shell's initial prompt
// metadata arrives. The startup marker must never consume that command.
assert(
  classifyTerminalCompletionEvent({
    initialPromptSeen: false,
    hasPendingCommand: true
  }) === "startup",
  "startup prompt can still consume a pending first command"
);

assert(
  classifyTerminalCompletionEvent({
    initialPromptSeen: true,
    hasPendingCommand: true
  }) === "command",
  "real command completion is not recognized"
);

assert(
  classifyTerminalCompletionEvent({
    initialPromptSeen: true,
    hasPendingCommand: false
  }) === "idle",
  "idle prompt is incorrectly treated as command completion"
);

const marker = "\u001dGITSTACK_META:0|/workspace/branch-lab\u001e";
const parsed = parseTerminalCommandCompletion("", marker);
assert(parsed.events.length === 1, "completion marker missing");
assert(parsed.events[0].exitCode === 0, "exit code missing");
assert(parsed.events[0].cwd === "/workspace/branch-lab", "real cwd missing");

const manager = fs.readFileSync("services/sandbox/terminal-manager.js", "utf8");
assert(manager.includes("initialPromptSeen: false"), "startup sync state missing");
assert(manager.includes('completionType === "startup"'), "startup completion path missing");
assert(manager.includes("session.initialPromptSeen = true"), "startup state never completes");
assert(manager.includes("if (!session.initialPromptSeen) return;"), "pre-ready mission input is not guarded");
assert(!/const forwardShellStdout = \\(chunk\\) => \\{\\s*markReady\\(\\)/.test(manager),
  "terminal still reports ready before initial shell metadata");

console.log("v30 Branching reset/prompt synchronization regression test passed.");
