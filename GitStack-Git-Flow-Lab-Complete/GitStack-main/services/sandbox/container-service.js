import { sandboxConfig } from "./config.js";
import {
  SANDBOX_LABELS,
  SANDBOX_USER,
  SANDBOX_WORKDIR
} from "./constants.js";
import { runDocker } from "./docker-client.js";
import { SandboxError } from "./errors.js";
import { resolveSandboxNetwork } from "./network-service.js";

function containerName(sandboxId) {
  return `${sandboxConfig.containerPrefix}-${sandboxId}`;
}

function labelArgument(key, value) {
  if (value === undefined || value === null || value === "") return [];
  return ["--label", `${key}=${value}`];
}

function sanitizeContainerInfo(raw) {
  const labels = raw.Config?.Labels || {};
  const state = raw.State || {};
  const hostConfig = raw.HostConfig || {};

  return {
    sandboxId: labels[SANDBOX_LABELS.sandboxId],
    sessionId: labels[SANDBOX_LABELS.sessionId] || null,
    ownerUserId: labels[SANDBOX_LABELS.ownerUserId],
    missionRunId: labels[SANDBOX_LABELS.missionRunId] || null,
    mode: labels[SANDBOX_LABELS.mode] || "ISOLATED",
    containerId: raw.Id,
    containerName: raw.Name?.replace(/^\//, ""),
    status: state.Status || "unknown",
    running: Boolean(state.Running),
    exitCode: state.ExitCode ?? null,
    stateError: state.Error || "",
    createdAt: labels[SANDBOX_LABELS.createdAt] || raw.Created,
    expiresAt: labels[SANDBOX_LABELS.expiresAt] || null,
    user: raw.Config?.User || null,
    workspace: raw.Config?.WorkingDir || null,
    limits: {
      cpus: hostConfig.NanoCpus ? hostConfig.NanoCpus / 1_000_000_000 : 0,
      memoryMb: hostConfig.Memory ? hostConfig.Memory / (1024 * 1024) : 0,
      pids: hostConfig.PidsLimit ?? 0,
      network: hostConfig.NetworkMode || null,
      readOnlyRootFilesystem: Boolean(hostConfig.ReadonlyRootfs),
      dropAllCapabilities: Array.isArray(hostConfig.CapDrop)
        ? hostConfig.CapDrop.includes("ALL")
        : false,
      noNewPrivileges: Array.isArray(hostConfig.SecurityOpt)
        ? hostConfig.SecurityOpt.includes("no-new-privileges:true")
        : false
    }
  };
}

async function inspectByContainerReference(reference) {
  const result = await runDocker(["inspect", reference], { allowNonZero: true });

  if (result.exitCode !== 0) return null;

  try {
    const parsed = JSON.parse(result.stdout);
    return parsed[0] || null;
  } catch (cause) {
    throw new SandboxError("Docker returned invalid container metadata.", {
      cause,
      code: "INVALID_DOCKER_INSPECT_RESPONSE",
      statusCode: 500
    });
  }
}

export async function findContainerBySandboxId(sandboxId) {
  const result = await runDocker([
    "ps",
    "-a",
    "--filter",
    `label=${SANDBOX_LABELS.managed}=true`,
    "--filter",
    `label=${SANDBOX_LABELS.sandboxId}=${sandboxId}`,
    "--format",
    "{{.ID}}"
  ]);

  const id = result.stdout.trim().split("\n").filter(Boolean)[0];
  if (!id) return null;

  const raw = await inspectByContainerReference(id);
  return raw ? sanitizeContainerInfo(raw) : null;
}

export async function listManagedContainers(filters = {}) {
  const args = [
    "ps",
    "-a",
    "--filter",
    `label=${SANDBOX_LABELS.managed}=true`
  ];

  if (filters.ownerUserId) {
    args.push(
      "--filter",
      `label=${SANDBOX_LABELS.ownerUserId}=${filters.ownerUserId}`
    );
  }

  args.push("--format", "{{.ID}}");
  const result = await runDocker(args);
  const ids = result.stdout.trim().split("\n").filter(Boolean);

  const containers = [];
  for (const id of ids) {
    const raw = await inspectByContainerReference(id);
    if (raw) containers.push(sanitizeContainerInfo(raw));
  }
  return containers;
}

export async function createContainer({
  sandboxId,
  sessionId,
  ownerUserId,
  missionRunId,
  mode = "ISOLATED",
  expiresAt
}) {
  const name = containerName(sandboxId);
  const createdAt = new Date().toISOString();
  const memory = `${sandboxConfig.memoryMb}m`;
  const network = await resolveSandboxNetwork(mode);

  const args = [
    "create",
    "--name",
    name,
    "--hostname",
    "gitstack-sandbox",
    "--user",
    SANDBOX_USER.dockerUser,
    "--workdir",
    SANDBOX_WORKDIR,
    "--cpus",
    String(sandboxConfig.cpuLimit),
    "--memory",
    memory,
    "--memory-swap",
    memory,
    "--pids-limit",
    String(sandboxConfig.pidsLimit),
    "--network",
    network,
    ...(sandboxConfig.hardening.readOnlyRootFilesystem ? ["--read-only"] : []),
    ...(sandboxConfig.hardening.dropAllCapabilities
      ? ["--cap-drop", "ALL"]
      : []),
    ...(sandboxConfig.hardening.noNewPrivileges
      ? ["--security-opt", "no-new-privileges:true"]
      : []),
    "--stop-timeout",
    "2",
    "--tmpfs",
    `${SANDBOX_WORKDIR}:rw,nosuid,nodev,size=${sandboxConfig.workspaceMb}m,mode=0700,uid=${SANDBOX_USER.uid},gid=${SANDBOX_USER.gid}`,
    "--tmpfs",
    `/tmp:rw,nosuid,nodev,size=${sandboxConfig.tempMb}m,mode=1777`,
    ...labelArgument(SANDBOX_LABELS.managed, "true"),
    ...labelArgument(SANDBOX_LABELS.sandboxId, sandboxId),
    ...labelArgument(SANDBOX_LABELS.sessionId, sessionId),
    ...labelArgument(SANDBOX_LABELS.ownerUserId, ownerUserId),
    ...labelArgument(SANDBOX_LABELS.missionRunId, missionRunId),
    ...labelArgument(SANDBOX_LABELS.mode, mode),
    ...labelArgument(SANDBOX_LABELS.createdAt, createdAt),
    ...labelArgument(SANDBOX_LABELS.expiresAt, expiresAt),
    sandboxConfig.image
  ];

  await runDocker(args);
  return findContainerBySandboxId(sandboxId);
}

export async function startContainer(sandboxId) {
  const info = await findContainerBySandboxId(sandboxId);
  if (!info) {
    throw new SandboxError("Sandbox was not found.", {
      code: "SANDBOX_NOT_FOUND",
      statusCode: 404
    });
  }

  if (!info.running) await runDocker(["start", info.containerName]);

  for (let attempt = 0; attempt < 15; attempt += 1) {
    const current = await findContainerBySandboxId(sandboxId);
    if (current?.running) return current;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const stopped = await findContainerBySandboxId(sandboxId);
  const logs = stopped?.containerName
    ? await runDocker(["logs", stopped.containerName], { allowNonZero: true })
    : null;

  throw new SandboxError("Sandbox container started but did not stay running.", {
    code: "SANDBOX_CONTAINER_EXITED",
    statusCode: 500,
    details: {
      status: stopped?.status || "unknown",
      exitCode: stopped?.exitCode ?? null,
      containerName: stopped?.containerName || null,
      logs: logs?.stderr?.trim() || logs?.stdout?.trim() || ""
    }
  });
}

export async function stopContainer(sandboxId) {
  const info = await findContainerBySandboxId(sandboxId);
  if (!info) {
    throw new SandboxError("Sandbox was not found.", {
      code: "SANDBOX_NOT_FOUND",
      statusCode: 404
    });
  }

  if (info.running) {
    await runDocker(["stop", "--time", "2", info.containerName]);
  }
  return findContainerBySandboxId(sandboxId);
}

export async function removeContainer(sandboxId) {
  const info = await findContainerBySandboxId(sandboxId);
  if (!info) return false;
  await runDocker(["rm", "--force", info.containerName]);
  return true;
}

export async function inspectContainer(sandboxId) {
  return findContainerBySandboxId(sandboxId);
}
