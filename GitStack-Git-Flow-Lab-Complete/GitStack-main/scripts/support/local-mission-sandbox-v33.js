import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function inTestWorkspace(value) {
  const original = String(value);
  const root = globalThis.__missionTestWorkspace;
  return original === "/workspace" ? root : original.replaceAll("/workspace/", `${root}/`);
}

export async function runFixedSandboxCommand(_sandboxId, command, { workdir = "/workspace" } = {}) {
  const cwd = inTestWorkspace(workdir);
  if (!fs.existsSync(cwd)) return { exitCode: 1, stdout: "", stderr: "Workspace does not exist" };
  const argv = command.map(inTestWorkspace);
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: path.join(globalThis.__missionTestRoot, "gitconfig"),
      GIT_CONFIG_NOSYSTEM: "1"
    }
  });
  return { exitCode: result.status ?? 1, stdout: result.stdout || "", stderr: result.stderr || String(result.error || "") };
}

export async function runTrustedMissionScript(sandboxId, script, options = {}) {
  const result = await runFixedSandboxCommand(sandboxId, ["bash", "-lc", script.replaceAll("/workspace", globalThis.__missionTestWorkspace)], options);
  if (result.exitCode !== 0) throw new Error(result.stderr || "Mission setup failed");
  return result;
}
