import { sandboxConfig } from "./config.js";
import { runDocker } from "./docker-client.js";
import { SandboxError } from "./errors.js";

export async function sandboxImageExists() {
  const result = await runDocker(["image", "inspect", sandboxConfig.image], {
    allowNonZero: true
  });
  return result.exitCode === 0;
}

export async function assertSandboxImageExists() {
  if (!(await sandboxImageExists())) {
    throw new SandboxError(
      `Sandbox image ${sandboxConfig.image} is missing. Run npm run sandbox:build first.`,
      {
        code: "SANDBOX_IMAGE_MISSING",
        statusCode: 503
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
