import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function positiveNumber(name, fallback, options = {}) {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  if (options.integer && !Number.isInteger(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function booleanValue(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  throw new Error(`${name} must be true or false.`);
}

function safePrefix(value) {
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/i.test(value)) {
    throw new Error(
      "SANDBOX_CONTAINER_PREFIX must contain only letters, numbers, and hyphens."
    );
  }
  return value.toLowerCase();
}

export const sandboxConfig = Object.freeze({
  image: process.env.SANDBOX_IMAGE || "gitstack-sandbox:week1",
  containerPrefix: safePrefix(
    process.env.SANDBOX_CONTAINER_PREFIX || "gitstack-sandbox"
  ),
  cpuLimit: positiveNumber("SANDBOX_CPU_LIMIT", 0.5),
  memoryMb: positiveNumber("SANDBOX_MEMORY_MB", 256, { integer: true }),
  pidsLimit: positiveNumber("SANDBOX_PIDS_LIMIT", 64, { integer: true }),
  workspaceMb: positiveNumber("SANDBOX_WORKSPACE_MB", 64, { integer: true }),
  tempMb: positiveNumber("SANDBOX_TEMP_MB", 32, { integer: true }),
  commandTimeoutMs: positiveNumber("SANDBOX_COMMAND_TIMEOUT_MS", 10_000, {
    integer: true
  }),
  dockerTimeoutMs: positiveNumber("SANDBOX_DOCKER_TIMEOUT_MS", 30_000, {
    integer: true
  }),
  lifetimeMinutes: positiveNumber("SANDBOX_LIFETIME_MINUTES", 60, {
    integer: true
  }),
  cleanupIntervalMs: positiveNumber(
    "SANDBOX_CLEANUP_INTERVAL_MS",
    5 * 60 * 1000,
    { integer: true }
  ),
  maxPerUser: positiveNumber("SANDBOX_MAX_PER_USER", 3, { integer: true }),
  terminalIdleMinutes: positiveNumber("SANDBOX_TERMINAL_IDLE_MINUTES", 30, { integer: true }),
  isolatedNetwork: process.env.SANDBOX_ISOLATED_NETWORK || "none",
  collaborationNetwork:
    process.env.SANDBOX_COLLABORATION_NETWORK || "gitstack-sandbox-network",
  dockerSocketPath: process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock",
  hardening: Object.freeze({
    readOnlyRootFilesystem: booleanValue("SANDBOX_READ_ONLY_ROOTFS", false),
    dropAllCapabilities: booleanValue("SANDBOX_DROP_ALL_CAPABILITIES", false),
    noNewPrivileges: booleanValue("SANDBOX_NO_NEW_PRIVILEGES", false)
  }),
  dockerfileContext: __dirname
});
