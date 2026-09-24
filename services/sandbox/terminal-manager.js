import { spawn } from "node:child_process";

import { sandboxConfig } from "./config.js";
import { SANDBOX_USER, SANDBOX_WORKDIR } from "./constants.js";
import { SandboxError } from "./errors.js";
import { getMissionProgress, getMissionStepCount, observeMissionCommand, evaluateSequentialMissionCommand } from "../student/mission-terminal-policy.js";
import { classifyTerminalCompletionEvent, missionPromptCommandEnv, parseTerminalCommandCompletion } from "./terminal-command-completion.js";

const MAX_INPUT_CHARS = 8 * 1024;
const TERMINAL_START_TIMEOUT_MS = 20_000;

export function createTerminalManager(logger = console) {
  const sessions = new Map();

  function close(sandboxId, reason = "Terminal session closed.") {
    const session = sessions.get(sandboxId);
    if (!session) return false;
    sessions.delete(sandboxId);
    clearTimeout(session.idleTimer);
    clearTimeout(session.startupTimer);

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

  function open({ sandbox, connection, prisma = null }) {
    if (!sandbox?.containerName || !sandbox.running) {
      throw new SandboxError("Sandbox must be running before opening a terminal.", {
        code: "SANDBOX_NOT_RUNNING",
        statusCode: 409
      });
    }

    close(sandbox.sandboxId, "A newer terminal connection was opened.");

    // Resume inside the mission workspace once at least one step is complete.
    // Fresh attempts still start at /workspace so navigation steps such as
    // "Enter branch-lab" remain meaningful. This keeps the real shell cwd and
    // the mission validator cwd aligned after reconnecting an unfinished run.
    const configuredWorkspace = String(sandbox.mission?.instructions?.workspace || "").trim().replace(/\/+$/, "");
    const resumeProgress = Number(sandbox.missionRunProgressPercent || 0);
    const safeMissionWorkspace =
      /^\/workspace(?:\/[A-Za-z0-9._-]+)+$/.test(configuredWorkspace)
        ? configuredWorkspace
        : SANDBOX_WORKDIR;
    const startWorkdir = resumeProgress > 0 ? safeMissionWorkspace : SANDBOX_WORKDIR;

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
      "TERM=xterm-256color",
      "--env",
      "GIT_PAGER=cat",
      "--env",
      "PAGER=cat",
      "--env",
      "GIT_TERMINAL_PROMPT=0",
      "--env",
      "HISTFILE=/workspace/.bash_history",
      "--env",
      "PS1=student@gitstack:\\w\\$ ",
      "--env",
      missionPromptCommandEnv(),
      sandbox.containerName,
      "script",
      "-qefc",
      `cd "${startWorkdir}" 2>/dev/null || cd /workspace; exec /bin/bash --noprofile --norc -i`,
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
      columns: null,
      rows: null,
      idleTimer: null,
      startupTimer: null,
      ready: false,
      inputBuffer: "",
      commandPending: false,
      commandHistory: [],
      successfulCommands: [],
      historyIndex: null,
      missionSlug: sandbox.mission?.slug || null,
      mission: sandbox.mission || null,
      cwd: startWorkdir,
      inspected: false,
      pullCompleted: false,
      verifiedHistory: false,
      // Every terminal session is bound to exactly one MissionRun. Persisted
      // progress is the resume floor for action-based steps whose evidence is
      // not reconstructable after disconnecting/switching missions.
      persistedProgressPercent: Number(sandbox.missionRunProgressPercent || 0),
      completedSteps: (() => {
        const total = getMissionStepCount(sandbox.mission?.slug || null, sandbox.mission || null);
        const percent = Math.max(0, Math.min(100, Number(sandbox.missionRunProgressPercent || 0)));
        return total ? Math.min(total, Math.floor((percent * total + 0.0001) / 100)) : 0;
      })(),
      stepEvidence: {},
      lastProgressPercent: Number.NaN,
      shellMetaCarry: "",
      pendingShellCommand: null,
      initialPromptSeen: false
    };
    sessions.set(sandbox.sandboxId, session);
    resetIdleTimer(session);

    connection.sendJson({
      type: "status",
      status: "connecting",
      sandboxId: sandbox.sandboxId
    });

    async function publishMissionProgress({ force = false } = {}) {
      if (!session.missionSlug) return;
      try {
        const progress = await getMissionProgress({
          sandboxId: session.sandboxId,
          missionSlug: session.missionSlug,
          session,
          mission: session.mission
        });
        session.completedSteps = Number(progress?.completedSteps ?? progress?.completed ?? session.completedSteps ?? 0);
        session.persistedProgressPercent = Math.max(
          Number(session.persistedProgressPercent || 0),
          Number(progress?.progressPercent || 0)
        );
        if (prisma && sandbox.missionRunId && (force || progress.progressPercent !== session.lastProgressPercent)) {
          await prisma.missionRun.updateMany({
            where: { id: sandbox.missionRunId, status: "IN_PROGRESS" },
            data: { progressPercent: progress.progressPercent }
          });
        }
        if (force || progress.progressPercent !== session.lastProgressPercent) {
          session.lastProgressPercent = progress.progressPercent;
          connection.sendJson({ type: "mission-progress", ...progress });
        }
      } catch (error) {
        logger.warn?.("Unable to publish mission progress:", error.message);
      }
    }

    const markReady = () => {
      if (session.ready || sessions.get(sandbox.sandboxId) !== session) return;
      session.ready = true;
      clearTimeout(session.startupTimer);
      connection.sendJson({
        type: "status",
        status: "connected",
        sandboxId: sandbox.sandboxId
      });
      setTimeout(() => publishMissionProgress({ force: true }), 150).unref();
    };

    session.startupTimer = setTimeout(() => {
      if (session.ready || sessions.get(sandbox.sandboxId) !== session) return;
      connection.sendJson({
        type: "error",
        code: "TERMINAL_START_TIMEOUT",
        error: "Docker terminal did not become ready in time. Reconnect after Docker is responsive."
      });
      close(sandbox.sandboxId, "Terminal startup timed out.");
    }, TERMINAL_START_TIMEOUT_MS);
    session.startupTimer.unref();

    const forwardOutput = (chunk, { confirmsReady = false } = {}) => {
      if (confirmsReady) markReady();
      resetIdleTimer(session);
      connection.sendJson({ type: "output", data: chunk.toString("utf8") });
    };

    const handleShellCompletion = async ({ exitCode, cwd }) => {
      const completedCwd =
        cwd && cwd.startsWith("/workspace")
          ? (cwd.replace(/\/+$/, "") || "/workspace")
          : null;

      const completionType = classifyTerminalCompletionEvent({
        initialPromptSeen: session.initialPromptSeen,
        hasPendingCommand: Boolean(session.pendingShellCommand)
      });

      if (completionType === "startup") {
        if (completedCwd) session.cwd = completedCwd;
        session.initialPromptSeen = true;
        markReady();
        return;
      }

      if (completionType !== "command") return;

      const pending = session.pendingShellCommand;
      session.pendingShellCommand = null;
      session.commandPending = false;
      if (!pending) return;

      if (exitCode === 0 && pending.command) {
        session.successfulCommands.push(pending.command);
        if (session.successfulCommands.length > 100) session.successfulCommands.shift();
      }

      if (exitCode === 0 && pending.gate.decision === "execute-and-validate") {
        // Record the command first. observeMissionCommand has legacy relative
        // `cd` bookkeeping for non-shell callers. Applying Bash's cwd before
        // this call would append the directory twice (branch-lab/branch-lab).
        observeMissionCommand({
          missionSlug: session.missionSlug,
          command: pending.command,
          session,
          mission: session.mission,
          stepIndex: pending.gate.rule?.index,
          commandInfo: pending.gate.commandInfo
        });
      }

      // Bash is authoritative for cwd after the command actually finishes.
      if (completedCwd) session.cwd = completedCwd;

      await publishMissionProgress({
        force: exitCode === 0 && pending.gate.decision === "execute-and-validate"
      });
    };

    const forwardShellStdout = (chunk) => {
      resetIdleTimer(session);
      const parsed = parseTerminalCommandCompletion(session.shellMetaCarry, chunk.toString("utf8"));
      session.shellMetaCarry = parsed.carry;
      if (parsed.output) connection.sendJson({ type: "output", data: parsed.output });
      for (const event of parsed.events) void handleShellCompletion(event);
    };

    // Mission-aware commands are buffered and some of them are intentionally
    // not written to Bash (for example, an out-of-sequence mutating command).
    // In those cases Bash cannot draw a new PS1 for us. Likewise, when GitStack
    // appends guidance *after* a native Bash/Git error, the real PS1 has already
    // been printed above the guidance. Always finish GitStack-generated feedback
    // with a fresh prompt so the learner can immediately type the next command.
    const missionPrompt = () => {
      const cwd = String(session.cwd || "/workspace").replace(/\/+$/, "") || "/workspace";
      return `student@gitstack:${cwd}$ `;
    };

    const sendMissionPrompt = () => {
      if (!session.missionSlug || connection.closed) return;
      connection.sendJson({ type: "output", data: missionPrompt() });
    };

    const redrawMissionInput = (value = "") => {
      if (connection.closed) return;
      connection.sendJson({
        type: "output",
        data: `\r\u001b[2K${missionPrompt()}${value}`
      });
    };

    const sendMissionGuidanceAndPrompt = (message) => {
      if (connection.closed) return;
      connection.sendJson({ type: "output", data: `${message}\r\n\r\n${missionPrompt()}` });
    };
    child.stdout.on("data", forwardShellStdout);
    child.stderr.on("data", (chunk) => forwardOutput(chunk));

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
      clearTimeout(session.startupTimer);
      if (!session.ready) {
        connection.sendJson({
          type: "error",
          code: "TERMINAL_START_FAILED",
          error: `Docker terminal exited before the shell was ready (exit ${exitCode ?? 1}).`
        });
      }
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

        // Mission terminal: keep a local line buffer so mission policy can make
        // a PRE-EXECUTION decision. Approved/native-error commands are then sent
        // once to the real shell. This avoids duplicated commands and guarantees
        // that out-of-sequence mutating commands cannot alter the repository.
        if (session.missionSlug && session.mission) {
          if (!session.initialPromptSeen) return;

          // Mission input is line-buffered for pre-execution validation, so shell
          // readline cannot own arrow-key history. Reproduce standard terminal
          // Up/Down history behavior at this layer.
          if (data === "\u001b[A" || data === "\u001b[B") {
            if (session.commandHistory.length) {
              if (data === "\u001b[A") {
                if (session.historyIndex == null) session.historyIndex = session.commandHistory.length - 1;
                else session.historyIndex = Math.max(0, session.historyIndex - 1);
                session.inputBuffer = session.commandHistory[session.historyIndex] || "";
              } else {
                if (session.historyIndex == null) {
                  session.inputBuffer = "";
                } else if (session.historyIndex < session.commandHistory.length - 1) {
                  session.historyIndex += 1;
                  session.inputBuffer = session.commandHistory[session.historyIndex] || "";
                } else {
                  session.historyIndex = null;
                  session.inputBuffer = "";
                }
              }
              redrawMissionInput(session.inputBuffer);
            }
            return;
          }

          for (const ch of data) {
            if (ch === "\u0003") {
              session.inputBuffer = "";
              session.historyIndex = null;
              connection.sendJson({ type: "output", data: "^C\r\n" });
              sendMissionPrompt();
              continue;
            }
            if (ch === "\u007f" || ch === "\b") {
              session.historyIndex = null;
              if (session.inputBuffer.length) {
                session.inputBuffer = session.inputBuffer.slice(0, -1);
                connection.sendJson({ type: "output", data: "\b \b" });
              }
              continue;
            }
            if (ch !== "\r" && ch !== "\n") {
              session.historyIndex = null;
              if (session.inputBuffer.length < MAX_INPUT_CHARS) {
                session.inputBuffer += ch;
                connection.sendJson({ type: "output", data: ch });
              }
              continue;
            }

            const submittedCommand = session.inputBuffer.trim();
            session.inputBuffer = "";
            session.historyIndex = null;
            connection.sendJson({ type: "output", data: "\r\n" });
            if (!submittedCommand) {
              sendMissionPrompt();
              continue;
            }

            session.commandHistory.push(submittedCommand);
            if (session.commandHistory.length > 200) session.commandHistory.shift();

            const completedSteps = Number(session.completedSteps ?? session.missionProgress?.completedSteps ?? 0);
            const gate = evaluateSequentialMissionCommand({ mission: session.mission, command: submittedCommand, completedSteps });

            if (gate.decision === "block") {
              sendMissionGuidanceAndPrompt(gate.message);
              for (const delay of [100, 300]) setTimeout(() => publishMissionProgress(), delay).unref();
              continue;
            }

            // Execute through the real shell, then wait for Bash's next prompt
            // metadata before validating. There is no fixed 180/450/900ms race.
            session.commandPending = true;
            session.pendingShellCommand = { command: submittedCommand, gate };
            if (!child.stdin.destroyed) child.stdin.write(`${submittedCommand}\n`);
          }
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
          // This terminal uses a pipe-backed Docker exec session. Writing
          // `stty` into stdin executes it as visible user input, so retain the
          // validated client dimensions without injecting a shell command.
          session.columns = columns;
          session.rows = rows;
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
        clearTimeout(session.startupTimer);
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
