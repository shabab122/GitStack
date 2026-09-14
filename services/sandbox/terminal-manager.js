import { spawn } from "node:child_process";

import { sandboxConfig } from "./config.js";
import { SANDBOX_USER, SANDBOX_WORKDIR } from "./constants.js";
import { SandboxError } from "./errors.js";

const MAX_INPUT_CHARS = 8 * 1024;

export function createTerminalManager(logger = console) {
  const sessions = new Map();

  function close(sandboxId, reason = "Terminal session closed.") {
    const session = sessions.get(sandboxId);
    if (!session) return false;
    sessions.delete(sandboxId);
    clearTimeout(session.idleTimer);

    if (!session.connection.closed) {
      session.connection.sendJson({ type: "status", status: "closed", reason });
      session.connection.close(1000, reason);
    }

    if (!session.child.killed) {
      session.child.kill("SIGTERM");
      setTimeout(() => session.child.kill("SIGKILL"), 1000).unref();
    }
    return true;
  }

  function resetIdleTimer(session) {
    clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      close(session.sandboxId, "Terminal closed after being idle.");
    }, sandboxConfig.terminalIdleMinutes * 60 * 1000);
    session.idleTimer.unref();
  }

  function open({ sandbox, connection }) {
    if (!sandbox?.containerName || !sandbox.running) {
      throw new SandboxError("Sandbox must be running before opening a terminal.", {
        code: "SANDBOX_NOT_RUNNING",
        statusCode: 409
      });
    }

    close(sandbox.sandboxId, "A newer terminal connection was opened.");

    const args = [
      "exec",
      "-i",
      "--user",
      SANDBOX_USER.dockerUser,
      "--workdir",
      SANDBOX_WORKDIR,
      "--env",
      "HOME=/home/student",
      "--env",
      "TERM=dumb",
      sandbox.containerName,
      "script",
      "-qefc",
      "/usr/local/bin/gitstack-shell",
      "/dev/null"
    ];

    const child = spawn("docker", args, {
      shell: false,
      windowsHide: true,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const session = {
      sandboxId: sandbox.sandboxId,
      connection,
      child,
      idleTimer: null
    };
    sessions.set(sandbox.sandboxId, session);
    resetIdleTimer(session);

    connection.sendJson({
      type: "status",
      status: "connecting",
      sandboxId: sandbox.sandboxId
    });

    child.on("spawn", () => {
      connection.sendJson({
        type: "status",
        status: "connected",
        sandboxId: sandbox.sandboxId
      });
    });

    const forwardOutput = (chunk) => {
      resetIdleTimer(session);
      connection.sendJson({ type: "output", data: chunk.toString("utf8") });
    };
    child.stdout.on("data", forwardOutput);
    child.stderr.on("data", forwardOutput);

    child.on("error", (error) => {
      logger.error?.("Sandbox terminal process failed:", error.message);
      connection.sendJson({
        type: "error",
        error: "Unable to start the Docker terminal process."
      });
      close(sandbox.sandboxId, "Terminal process failed.");
    });

    child.on("close", (exitCode, signal) => {
      if (sessions.get(sandbox.sandboxId) !== session) return;
      sessions.delete(sandbox.sandboxId);
      clearTimeout(session.idleTimer);
      connection.sendJson({
        type: "exit",
        exitCode: exitCode ?? 1,
        signal
      });
      connection.close(1000, "Terminal process exited.");
    });

    connection.on("message", (raw) => {
      resetIdleTimer(session);
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        connection.sendJson({ type: "error", error: "Invalid terminal message." });
        return;
      }

      if (message.type === "input") {
        const data = String(message.data || "");
        if (data.length > MAX_INPUT_CHARS) {
          connection.sendJson({ type: "error", error: "Terminal input is too large." });
          return;
        }
        if (!child.stdin.destroyed) child.stdin.write(data);
        return;
      }

      if (message.type === "resize") {
        const columns = Number(message.columns);
        const rows = Number(message.rows);
        if (
          Number.isInteger(columns) &&
          Number.isInteger(rows) &&
          columns >= 20 &&
          columns <= 300 &&
          rows >= 5 &&
          rows <= 120
        ) {
          child.stdin.write(`stty cols ${columns} rows ${rows}\r`);
        }
        return;
      }

      if (message.type === "ping") {
        connection.sendJson({ type: "pong", at: Date.now() });
      }
    });

    connection.on("close", () => {
      if (sessions.get(sandbox.sandboxId) === session) {
        sessions.delete(sandbox.sandboxId);
        clearTimeout(session.idleTimer);
        if (!child.killed) child.kill("SIGTERM");
      }
    });

    connection.on("error", (error) => {
      logger.warn?.("Sandbox terminal WebSocket error:", error.message);
    });

    return session;
  }

  function closeAll(reason = "GitStack server is shutting down.") {
    for (const sandboxId of [...sessions.keys()]) close(sandboxId, reason);
  }

  return {
    open,
    close,
    closeAll,
    has: (sandboxId) => sessions.has(sandboxId),
    size: () => sessions.size
  };
}
