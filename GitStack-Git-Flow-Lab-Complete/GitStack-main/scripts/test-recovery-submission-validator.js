import fs from "node:fs";

const source = fs.readFileSync(new URL("../services/student/mission-validator-service.js", import.meta.url), "utf8");
const required = [
  "requiredBranch.startsWith(\"recovery/\")",
  "git\", \"merge-base\", \"--is-ancestor\"",
  "completed and merged into main",
  "Recovery branch ${requiredBranch} is active or safely merged into main"
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`Missing recovery submission behavior: ${token}`);
}
console.log("Recovery submission validator regression test passed.");
