import { runFixedSandboxCommand } from "./sandbox-exec.js";

export const STARTER_COMMIT_MESSAGE = "Initialize mission workspace";

// A starter commit makes branch/merge missions runnable, but it is not student
// work. Detect it from the repository itself so old published attempts and
// resumed sessions obey the same assessment rule as newly created ones.
export async function studentCommitCount(sandboxId, workdir = "/workspace") {
  const history = await runFixedSandboxCommand(
    sandboxId,
    ["git", "log", "--first-parent", "--reverse", "--format=%s"],
    { workdir }
  );
  if (history.exitCode !== 0) return 0;
  const messages = history.stdout.split("\n").map((message) => message.trim()).filter(Boolean);
  return Math.max(0, messages.length - (messages[0] === STARTER_COMMIT_MESSAGE ? 1 : 0));
}
