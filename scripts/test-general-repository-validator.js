import fs from "node:fs";

const source = fs.readFileSync(new URL("../services/student/mission-terminal-policy.js", import.meta.url), "utf8");

const required = [
  '["git", "rev-list", "--all", "--count"]',
  "distinctTrees < 2",
  "session.historyInspected",
  "session.recoveryAttempted",
  '["git", "status", "--porcelain"]',
  "commitCount < 3"
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error(`Repository validator regression: missing ${token}`);
  }
}

const recoveryStart = source.indexOf("async function commitRecoveryState");
const recoveryEnd = source.indexOf("const commitRecoveryAllowed", recoveryStart);
const recoverySource = source.slice(recoveryStart, recoveryEnd);
if (recoverySource.includes('["git", "rev-list", "--count", "HEAD"]')) {
  throw new Error("Recovery validator must not count only HEAD commits.");
}

console.log("General repository validator regression test passed.");
