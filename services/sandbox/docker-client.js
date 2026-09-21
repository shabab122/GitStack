import { spawn } from "node:child_process";

import { sandboxConfig } from "./config.js";
import { DockerCommandError } from "./errors.js";

const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_DIAGNOSTIC_CHARS = 600;

export function sanitizeDockerDiagnostic(value) {
  return String(value || "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/(https?:\/\/)([^\s/:@]+):([^\s/@]+)@/gi, "$1[redacted]@")
    .replace(/([?&](?:access_token|token|auth|password)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b((?:gitea_admin_token|access_token|password|secret)\s*[=:]\s*)[^\s]+/gi, "$1[redacted]")
    .replace(/\b(Bearer|token)\s+[A-Za-z0-9._~+\/-]+/gi, "$1 [redacted]")
    .trim()
    .slice(0, MAX_DIAGNOSTIC_CHARS);
}

export function classifyDockerFailure({
  stderr = "",
  stdout = "",
  args = [],
  exitCode = 1,
  originalCode = "DOCKER_COMMAND_FAILED"
} = {}) {
  const diagnostic = sanitizeDockerDiagnostic(stderr || stdout);
  const normalized = diagnostic.toLowerCase();

  if (
    normalized.includes("cannot connect to the docker daemon") ||
    normalized.includes("failed to connect to the docker api") ||
    normalized.includes("is the docker daemon running")
  ) {
    return {
      code: "DOCKER_DAEMON_UNAVAILABLE",
      statusCode: 503,
      message: "Docker daemon is unavailable. Start Docker and verify DOCKER_HOST."
    };
  }

  if (normalized.includes("permission denied") && normalized.includes("docker")) {
    return {
      code: "DOCKER_PERMISSION_DENIED",
      statusCode: 503,
      message: "GitStack does not have permission to access the Docker daemon."
    };
  }

  if (normalized.includes("no such container")) {
    return {
      code: "DOCKER_CONTAINER_NOT_FOUND",
      statusCode: 409,
      message: "The sandbox container no longer exists. Start the workspace again from Team Activity."
    };
  }

  if (normalized.includes("container") && normalized.includes("is not running")) {
    return {
      code: "SANDBOX_NOT_RUNNING",
      statusCode: 409,
      message: "The sandbox stopped before the operation completed. Start the workspace and retry."
    };
  }

  if (normalized.includes("no such image") || normalized.includes("pull access denied")) {
    return {
      code: "SANDBOX_IMAGE_MISSING",
      statusCode: 503,
      message: "The configured sandbox image is unavailable. Run npm run sandbox:build."
    };
  }

  const operation = String(args[0] || "command").replace(/[^a-z0-9_-]/gi, "") || "command";
  return {
    code: originalCode,
    statusCode: 500,
    message: diagnostic || `Docker ${operation} failed with exit code ${exitCode}.`
  };
}

export function runDocker(args, options = {}) {
  const timeoutMs = options.timeoutMs ?? sandboxConfig.dockerTimeoutMs;
  const allowNonZero = Boolean(options.allowNonZero);
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let terminatedForOutput = false;

    const child = spawn("docker", args, {
      shell: false,
      windowsHide: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 500).unref();
    }, timeoutMs);
    timer.unref();

    const appendOutput = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > MAX_OUTPUT_BYTES) {
        terminatedForOutput = true;
        child.kill("SIGTERM");
        return next.slice(0, MAX_OUTPUT_BYTES);
      }
      return next;
    };

    child.stdout.on("data", (chunk) => {
      stdout = appendOutput(stdout, chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr = appendOutput(stderr, chunk);
    });

    child.on("error", (cause) => {
      const isMissing = cause.code === "ENOENT";
      finishReject(
        new DockerCommandError(
          isMissing
            ? "Docker CLI is not installed or is not available in PATH."
            : "Unable to start the Docker CLI.",
          {
            cause,
            code: isMissing ? "DOCKER_CLI_NOT_FOUND" : "DOCKER_PROCESS_ERROR",
            statusCode: 503,
            command: ["docker", ...args]
          }
        )
      );
    });

    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const durationMs = Date.now() - startedAt;
      const timedOut = signal !== null && durationMs >= timeoutMs;

      if (terminatedForOutput) {
        return reject(
          new DockerCommandError("Docker command produced too much output.", {
            code: "DOCKER_OUTPUT_LIMIT_EXCEEDED",
            statusCode: 413,
            command: ["docker", ...args],
            exitCode,
            stdout,
            stderr
          })
        );
      }

      const result = {
        command: ["docker", ...args],
        exitCode: exitCode ?? 1,
        signal,
        stdout,
        stderr,
        durationMs,
        timedOut
      };

      if (timedOut) {
        return reject(
          new DockerCommandError("Docker command timed out.", {
            code: "DOCKER_COMMAND_TIMEOUT",
            statusCode: 504,
            command: result.command,
            exitCode: result.exitCode,
            stdout,
            stderr,
            timedOut: true
          })
        );
      }

      if (result.exitCode !== 0) {
        const classified = classifyDockerFailure({
          stderr,
          stdout,
          args,
          exitCode: result.exitCode
        });
        const infrastructureFailure = [
          "DOCKER_DAEMON_UNAVAILABLE",
          "DOCKER_PERMISSION_DENIED"
        ].includes(classified.code);

        if (!allowNonZero || infrastructureFailure) {
          return reject(
            new DockerCommandError(classified.message, {
              code: classified.code,
              statusCode: classified.statusCode,
              command: result.command,
              exitCode: result.exitCode,
              stdout,
              stderr
            })
          );
        }
      }

      resolve(result);
    });
  });
}
