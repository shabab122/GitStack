export class SandboxError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "SandboxError";
    this.code = options.code || "SANDBOX_ERROR";
    this.statusCode = options.statusCode || 500;
    this.details = options.details;
  }
}

export class DockerCommandError extends SandboxError {
  constructor(message, options = {}) {
    super(message, {
      cause: options.cause,
      code: options.code || "DOCKER_COMMAND_FAILED",
      statusCode: options.statusCode || 500,
      details: options.details
    });
    this.name = "DockerCommandError";
    this.command = options.command;
    this.exitCode = options.exitCode;
    this.stdout = options.stdout || "";
    this.stderr = options.stderr || "";
    this.timedOut = Boolean(options.timedOut);
  }
}

export function dockerFailureToSandboxError(error) {
  if (error instanceof SandboxError) {
    return error;
  }

  return new SandboxError("Docker operation failed unexpectedly.", {
    cause: error,
    code: "DOCKER_OPERATION_FAILED",
    statusCode: 500
  });
}
