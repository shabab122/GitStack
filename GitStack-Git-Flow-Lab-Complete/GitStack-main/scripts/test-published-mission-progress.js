import fs from "node:fs";
const source = fs.readFileSync(new URL("../services/student/mission-terminal-policy.js", import.meta.url), "utf8");
const required = [
  "genericMissionState",
  "genericStepSatisfied",
  "missionSteps(mission).length",
  "session.statusInspected || session.diffInspected",
  "const cdMatch = c.match",
  "return genericMissionState(sandboxId, session, mission)"
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`Published mission progress regression: missing ${token}`);
}
console.log("Published/custom mission progress regression test passed.");
