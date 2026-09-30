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

function safeDockerReference(value) {
  return /^[a-z0-9][a-z0-9_.-]{0,127}$/i.test(String(value || ""));
}

export async function ensureCollaborationNetworkPeer({ containerReference, alias = containerReference }) {
  const network = await ensureCollaborationNetwork();
  if (!safeDockerReference(containerReference) || !safeDockerReference(alias)) {
    throw new SandboxError("The collaboration service container name is invalid.", {
      code: "SANDBOX_NETWORK_PEER_INVALID",
      statusCode: 500
    });
  }

  const inspect = await runDocker(["inspect", containerReference], { allowNonZero: true });
  if (inspect.exitCode !== 0) {
    throw new SandboxError(
      `The collaboration service container '${containerReference}' was not found. Start Gitea before opening a student workspace.`,
      {
        code: "SANDBOX_NETWORK_PEER_NOT_FOUND",
        statusCode: 503,
        details: { containerReference, network }
      }
    );
  }

  let container;
  try {
    container = JSON.parse(inspect.stdout)?.[0] || null;
  } catch (cause) {
    throw new SandboxError("Docker returned invalid collaboration service metadata.", {
      cause,
      code: "SANDBOX_NETWORK_PEER_INSPECT_FAILED",
      statusCode: 500
    });
  }

  if (container?.NetworkSettings?.Networks?.[network]) {
    return { network, containerReference, alias, connected: true, changed: false };
  }

  const connected = await runDocker([
    "network",
    "connect",
    "--alias",
    alias,
    network,
    containerReference
  ], { allowNonZero: true });
  if (connected.exitCode !== 0 && !/already exists/i.test(connected.stderr)) {
    throw new SandboxError(
      `Gitea could not be connected to the private student collaboration network '${network}'.`,
      {
        code: "SANDBOX_NETWORK_PEER_CONNECT_FAILED",
        statusCode: 503,
        details: { containerReference, network, stderr: connected.stderr.trim() }
      }
    );
  }

  return { network, containerReference, alias, connected: true, changed: connected.exitCode === 0 };
}

export async function resolveSandboxNetwork(mode) {
  if (mode === "COLLABORATION") {
    return ensureCollaborationNetwork();
  }
  return sandboxConfig.isolatedNetwork;
}
