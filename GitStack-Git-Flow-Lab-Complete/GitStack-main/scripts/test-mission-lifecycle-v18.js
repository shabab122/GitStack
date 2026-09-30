import fs from "node:fs";
import { evaluateSequentialMissionCommand } from "../services/student/mission-terminal-policy.js";

const store = fs.readFileSync(new URL("../services/sandbox/sandbox-store.js", import.meta.url), "utf8");
const terminal = fs.readFileSync(new URL("../services/sandbox/terminal-manager.js", import.meta.url), "utf8");
const policy = fs.readFileSync(new URL("../services/student/mission-terminal-policy.js", import.meta.url), "utf8");

for (const token of ["missionRunProgressPercent", "missionRunAttemptNumber", "missionRunResetCount"]) {
  if (!store.includes(token)) throw new Error(`Sandbox mission context missing ${token}`);
}
for (const token of ["persistedProgressPercent", "sandbox.missionRunProgressPercent", "session.mission", "session.missionSlug"]) {
  if (!terminal.includes(token)) throw new Error(`Terminal lifecycle binding missing ${token}`);
}
if (!policy.includes("persistedCompleted")) throw new Error("Resumed mission progress floor is missing.");
if (policy.includes("Commands execute normally in Bash/Git")) throw new Error("Internal terminal implementation wording leaked into learner feedback.");

const missionA = { instructions: { steps: ["Run git init", "Create profile.html"] } };
const missionB = { instructions: { steps: ["Enter recovery-lab and inspect git status / git diff", "Restore notes.txt"] } };

let r = evaluateSequentialMissionCommand({ mission: missionA, command: "git init", completedSteps: 0 });
if (r.decision !== "execute-and-validate") throw new Error("Mission A did not load its own Step 1 rule.");
r = evaluateSequentialMissionCommand({ mission: missionB, command: 'git commit -m "wrong"', completedSteps: 0 });
if (r.decision !== "block" || !r.message.includes("Step 1") || !r.message.includes("recovery-lab")) {
  throw new Error("Mission B reused/staled another mission context.");
}
r = evaluateSequentialMissionCommand({ mission: missionA, command: "touch profile.html", completedSteps: 1 });
if (r.decision !== "execute-and-validate") throw new Error("Resumed mission did not use its current incomplete step.");
r = evaluateSequentialMissionCommand({ mission: missionB, command: "git status", completedSteps: 0 });
if (r.decision !== "execute-and-validate") throw new Error("New/switched mission active step was not evaluated.");

console.log("v18 mission lifecycle/context regression test passed.");
