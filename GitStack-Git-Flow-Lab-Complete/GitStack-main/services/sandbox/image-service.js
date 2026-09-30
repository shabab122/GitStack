import { sandboxConfig } from "./config.js";
import {
  SANDBOX_IMAGE_SCHEMA_LABEL,
  SANDBOX_IMAGE_SCHEMA_VERSION
} from "./constants.js";
import { runDocker } from "./docker-client.js";
import { SandboxError } from "./errors.js";

export async function sandboxImageStatus() {
  const result = await runDocker([
    "image",
    "inspect",
    "--format",
    "{{json .Config.Labels}}",
    sandboxConfig.image
  ], { allowNonZero: true });

  if (result.exitCode !== 0) {
    return { exists: false, compatible: false, schema: null };
  }

  let labels = {};
  try {
    labels = JSON.parse(result.stdout.trim() || "{}") || {};
  } catch {
    labels = {};
  }
  const schema = labels[SANDBOX_IMAGE_SCHEMA_LABEL] || null;
  return {
    exists: true,
    compatible: schema === SANDBOX_IMAGE_SCHEMA_VERSION,
    schema
  };
}

export async function sandboxImageExists() {
  return (await sandboxImageStatus()).exists;
}

export async function assertSandboxImageExists() {
  const status = await sandboxImageStatus();
  if (!status.exists) {
    throw new SandboxError(
      `Sandbox image ${sandboxConfig.image} is missing. Run npm run sandbox:build first.`,
      {
        code: "SANDBOX_IMAGE_MISSING",
        statusCode: 503
      }
    );
  }
  if (!status.compatible) {
    throw new SandboxError(
      `Sandbox image ${sandboxConfig.image} is outdated. Run npm run sandbox:build to rebuild it.`,
      {
        code: "SANDBOX_IMAGE_OUTDATED",
        statusCode: 503,
        details: {
          expectedSchema: SANDBOX_IMAGE_SCHEMA_VERSION,
          actualSchema: status.schema
        }
      }
    );
  }
}

export async function buildSandboxImage() {
  const result = await runDocker(
    [
      "build",
      "--pull",
      "--tag",
      sandboxConfig.image,
      sandboxConfig.dockerfileContext
    ],
    { timeoutMs: Math.max(sandboxConfig.dockerTimeoutMs, 10 * 60 * 1000) }
  );

  return {
    image: sandboxConfig.image,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs
  };
}
