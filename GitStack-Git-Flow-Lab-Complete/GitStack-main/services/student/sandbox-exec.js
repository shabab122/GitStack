import { sandboxConfig } from "../sandbox/config.js";
import { inspectContainer } from "../sandbox/container-service.js";
import { runDocker } from "../sandbox/docker-client.js";
import { SandboxError } from "../sandbox/errors.js";
import { SANDBOX_USER, SANDBOX_WORKDIR } from "../sandbox/constants.js";

export async function runFixedSandboxCommand(
  sandboxId,
  command,
  {
    workdir = SANDBOX_WORKDIR,
    allowNonZero = true,
    timeoutMs = sandboxConfig.commandTimeoutMs
  } = {}
) {
  const container = await inspectContainer(sandboxId);
  if (!container) {
    throw new SandboxError("Sandbox was not found.", {
      code: "SANDBOX_NOT_FOUND",
      statusCode: 404
    });
  }
  if (!container.running) {
    throw new SandboxError("Sandbox must be running for mission validation.", {
      code: "SANDBOX_NOT_RUNNING",
      statusCode: 409
    });
  }

  const result = await runDocker(
    [
      "exec",
      "--user",
      SANDBOX_USER.dockerUser,
      "--workdir",
      workdir,
      container.containerName,
      ...command
    ],
    {
      allowNonZero,
      timeoutMs: timeoutMs + 2000
    }
  );

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs
  };
}

export async function runTrustedMissionScript(sandboxId, script, options = {}) {
  return runFixedSandboxCommand(
    sandboxId,
    ["/bin/bash", "-lc", script],
    { ...options, allowNonZero: false }
  );
}
