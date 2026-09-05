import { sandboxConfig } from "./config.js";
import {
  APPROVED_COMMANDS,
  SANDBOX_USER,
  SANDBOX_WORKDIR
} from "./constants.js";
import { inspectContainer } from "./container-service.js";
import { runDocker } from "./docker-client.js";
import { SandboxError } from "./errors.js";

export function listApprovedCommands() {
  return Object.keys(APPROVED_COMMANDS);
}

export async function executeApprovedCommand(sandboxId, commandName) {
  const command = APPROVED_COMMANDS[commandName];

  if (!command) {
    throw new SandboxError("Unsupported sandbox command.", {
      code: "UNSUPPORTED_SANDBOX_COMMAND",
      statusCode: 400
    });
  }

  const container = await inspectContainer(sandboxId);
  if (!container) {
    throw new SandboxError("Sandbox was not found.", {
      code: "SANDBOX_NOT_FOUND",
      statusCode: 404
    });
  }

  if (!container.running) {
    throw new SandboxError("Sandbox is not running.", {
      code: "SANDBOX_NOT_RUNNING",
      statusCode: 409
    });
  }

  const seconds = Math.max(1, Math.ceil(sandboxConfig.commandTimeoutMs / 1000));
  const result = await runDocker(
    [
      "exec",
      "--user",
      SANDBOX_USER.dockerUser,
      "--workdir",
      SANDBOX_WORKDIR,
      container.containerName,
      "timeout",
      "--signal=TERM",
      "--kill-after=1s",
      `${seconds}s`,
      ...command
    ],
    {
      allowNonZero: true,
      timeoutMs: sandboxConfig.commandTimeoutMs + 3_000
    }
  );

  if (result.exitCode === 124 || result.exitCode === 137) {
    throw new SandboxError("Sandbox command execution timed out.", {
      code: "SANDBOX_COMMAND_TIMEOUT",
      statusCode: 408
    });
  }

  return {
    command: commandName,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs
  };
}
