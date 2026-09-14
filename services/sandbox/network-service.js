import { sandboxConfig } from "./config.js";
import { runDocker } from "./docker-client.js";
import { SandboxError } from "./errors.js";

export async function ensureCollaborationNetwork() {
  const name = sandboxConfig.collaborationNetwork;
  const inspect = await runDocker(["network", "inspect", name], {
    allowNonZero: true
  });

  if (inspect.exitCode === 0) return name;

  const created = await runDocker([
    "network",
    "create",
    "--driver",
    "bridge",
    "--internal",
    "--label",
    "gitstack.managed=true",
    "--label",
    "gitstack.purpose=sandbox-collaboration",
    name
  ], { allowNonZero: true });

  if (created.exitCode !== 0) {
    throw new SandboxError("Unable to prepare the private collaboration network.", {
      code: "SANDBOX_NETWORK_CREATE_FAILED",
      statusCode: 503,
      details: { stderr: created.stderr.trim() }
    });
  }

  return name;
}

export async function resolveSandboxNetwork(mode) {
  if (mode === "COLLABORATION") {
    return ensureCollaborationNetwork();
  }
  return sandboxConfig.isolatedNetwork;
}
