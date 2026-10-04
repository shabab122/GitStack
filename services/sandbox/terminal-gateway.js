import jwt from "jsonwebtoken";

import { getOwnedSandbox, touchSandbox } from "./sandbox-service.js";
import { ensureMissionWorkspace } from "../student/mission-setup-service.js";
import { reconnectCollaborationGitRelay, closeAllCollaborationGitRelays } from "../collaboration/git-relay-service.js";
import {
  acceptWebSocketUpgrade,
  rejectWebSocketUpgrade
} from "./websocket-connection.js";

const TERMINAL_PATH = /^\/ws\/sandboxes\/([0-9a-f-]{36})\/terminal$/i;

function parseCookies(header = "") {
  const cookies = {};
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

export function attachSandboxTerminalGateway({
  server,
  prisma,
  terminalManager,
  cookieName,
  jwtSecret,
  appOrigin,
  logger = console
}) {
  const onUpgrade = (req, socket, head) => {
    socket.pause();

    Promise.resolve()
      .then(async () => {
        const url = new URL(req.url || "/", "http://localhost");
        const match = url.pathname.match(TERMINAL_PATH);
        if (!match) {
          rejectWebSocketUpgrade(socket, 404, "Terminal route not found.");
          return;
        }

        const origin = req.headers.origin;
        if (origin && appOrigin && origin !== appOrigin) {
          rejectWebSocketUpgrade(socket, 403, "WebSocket origin is not allowed.");
          return;
        }

        const token = parseCookies(req.headers.cookie || "")[cookieName];
        if (!token) {
          rejectWebSocketUpgrade(socket, 401, "Authentication required.");
          return;
        }

        let payload;
        try {
          payload = jwt.verify(token, jwtSecret, {
            issuer: "gitstack-api",
            audience: "gitstack-web"
          });
        } catch {
          rejectWebSocketUpgrade(socket, 401, "Session is invalid or expired.");
          return;
        }

        const user = await prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user || !user.isActive) {
          rejectWebSocketUpgrade(socket, 401, "Session is no longer valid.");
          return;
        }

        const sandboxId = match[1];
        const sandbox = await getOwnedSandbox(sandboxId, user.id, { prisma });
        if (!sandbox.running) {
          rejectWebSocketUpgrade(socket, 409, "Sandbox is not running.");
          return;
        }

        // Old in-progress attempts can predate the dynamic starter setup.
        // Repair only untouched attempts, before accepting terminal input.
        if (sandbox.mission && sandbox.missionRunStatus === "IN_PROGRESS" &&
            Number(sandbox.missionRunProgressPercent || 0) === 0 &&
            String(sandbox.mode).toUpperCase() === "ISOLATED") {
          await ensureMissionWorkspace(sandboxId, sandbox.mission.slug, {
            progressPercent: 0,
            mission: sandbox.mission
          });
        }

        const connection = acceptWebSocketUpgrade(req, socket, head);
        if (!connection) return;
        socket.resume();

        try {
          if (String(sandbox.mode).toUpperCase() === "COLLABORATION") {
            await reconnectCollaborationGitRelay(sandbox);
          }
          const columns = Number(url.searchParams.get("columns"));
          const rows = Number(url.searchParams.get("rows"));
          const dimensions = Number.isInteger(columns) && columns >= 20 && columns <= 300 &&
            Number.isInteger(rows) && rows >= 5 && rows <= 120
            ? { columns, rows }
            : null;
          terminalManager.open({ sandbox, connection, prisma, dimensions });
          await touchSandbox(sandboxId, { prisma });
        } catch (error) {
          logger.error?.("Unable to open sandbox terminal:", error.message);
          connection.sendJson({
            type: "error",
            error: error.message || "Unable to open sandbox terminal."
          });
          connection.close(1011, "Unable to open terminal.");
        }
      })
      .catch((error) => {
        logger.warn?.("WebSocket upgrade rejected:", error.message);
        if (!socket.destroyed) {
          rejectWebSocketUpgrade(
            socket,
            error.statusCode || 500,
            error.message || "Terminal connection failed."
          );
        }
      });
  };

  server.on("upgrade", onUpgrade);
  const closeRelays = () => { void closeAllCollaborationGitRelays(); };
  server.on("close", closeRelays);
  return () => {
    server.off("upgrade", onUpgrade);
    server.off("close", closeRelays);
    closeRelays();
  };
}
