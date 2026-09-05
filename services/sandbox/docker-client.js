import { spawn } from "node:child_process";

import { sandboxConfig } from "./config.js";
import { DockerCommandError } from "./errors.js";

const MAX_OUTPUT_BYTES = 1024 * 1024;

function classifyDockerFailure(stderr, originalCode = "DOCKER_COMMAND_FAILED") {
  const normalized = stderr.toLowerCase();

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

  return {
    code: originalCode,
    statusCode: 500,
    message: stderr.trim() || "Docker command failed."
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
        const classified = classifyDockerFailure(stderr);
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
