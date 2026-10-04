import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Duplex } from "node:stream";

import { giteaBaseUrl, giteaInternalBaseUrl } from "../gitea/gitea-client.js";
import { SANDBOX_USER } from "../sandbox/constants.js";
import { runDocker, sanitizeDockerDiagnostic } from "../sandbox/docker-client.js";
import { SandboxError } from "../sandbox/errors.js";

const relayScript = readFileSync(new URL("./git-http-relay.pl", import.meta.url), "utf8");
const relays = new Map();
const hopHeaders = new Set(["connection", "proxy-connection", "proxy-authorization", "keep-alive", "te", "trailer", "transfer-encoding", "upgrade"]);

function relayError(diagnostic = "") {
  const detail = sanitizeDockerDiagnostic(diagnostic);
  return new SandboxError(`The collaboration Git connection could not be started. Retry Reconnect terminal; Gitea must be reachable from the app server.${detail ? ` ${detail}` : ""}`, {
    code: "COLLABORATION_GIT_RELAY_FAILED", statusCode: 503
  });
}

function forwardHeaders(headers) {
  const excluded = new Set([...hopHeaders, ...String(headers.connection || "").toLowerCase().split(",").map(s => s.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !excluded.has(key.toLowerCase())));
}

/** A fixed-target Git HTTP proxy carried through Docker's authenticated exec pipe.
 * No host port is opened, no service token is installed, and no firewall rule changes.
 * spawnRelay is injectable only for the isolated transport regression.
 */
export async function openCollaborationGitRelay({
  containerName, baseUrl = giteaBaseUrl(), internalBaseUrl = giteaInternalBaseUrl(),
  spawnRelay = () => spawn("docker", [
    "exec", "-i", "--user", SANDBOX_USER.dockerUser, "--workdir", "/workspace",
    containerName, "perl", "-e", relayScript
  ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
}) {
  const target = new URL(baseUrl);
  const internal = new URL(internalBaseUrl);
  if (!["http:", "https:"].includes(target.protocol) || !["http:", "https:"].includes(internal.protocol) ||
      target.username || target.password || internal.username || internal.password) throw relayError();
  const origins = new Set([target.origin, internal.origin]);
  const child = spawnRelay(relayScript);
  const sockets = new Map();
  const upstreams = new Set();
  let alive = true;
  let port;
  let carry = "";
  let startupDiagnostic = "";
  let readyResolve;
  let readyReject;
  let writeSequence = 0;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });

  const send = frame => {
    if (!alive || child.stdin.destroyed) return false;
    child.stdin.write(JSON.stringify(frame) + "\n");
    return true;
  };

  class RelaySocket extends Duplex {
    constructor(id) {
      super({ allowHalfOpen: true });
      this.id = id;
      this.remoteAddress = "127.0.0.1";
      this.remotePort = 0;
      this.pending = null;
      this.timeoutTimer = null;
    }
    _read() { send({ type: "resume", id: this.id }); }
    _write(bytes, encoding, callback) {
      const writeNext = offset => {
        if (this.destroyed || !alive) { callback(relayError()); return; }
        if (offset >= bytes.length) { this.pending = null; callback(); return; }
        const part = bytes.subarray(offset, offset + 32768);
        const seq = ++writeSequence;
        this.pending = { seq, done: () => writeNext(offset + part.length), fail: callback };
        if (!send({ type: "data", id: this.id, seq, data: part.toString("base64") })) {
          this.pending = null;
          callback(relayError());
        }
      };
      writeNext(0);
    }
    _final(callback) { send({ type: "end", id: this.id }); callback(); }
    _destroy(error, callback) {
      clearTimeout(this.timeoutTimer);
      sockets.delete(this.id);
      send({ type: "close", id: this.id });
      const pending = this.pending;
      this.pending = null;
      if (pending) pending.fail(error || relayError());
      callback(error);
    }
    setTimeout(ms, callback) {
      clearTimeout(this.timeoutTimer);
      if (callback) this.once("timeout", callback);
      if (ms > 0) this.timeoutTimer = setTimeout(() => this.emit("timeout"), ms).unref();
      return this;
    }
    setNoDelay() { return this; }
    setKeepAlive() { return this; }
  }

  const proxy = http.createServer((req, res) => {
    let requested;
    let relativePath;
    try {
      requested = new URL(req.url, internal);
      const source = requested.origin === internal.origin ? internal : target;
      const prefix = source.pathname.replace(/\/$/, "");
      if (!origins.has(requested.origin) || requested.username || requested.password ||
          !requested.pathname.startsWith(`${prefix}/`)) throw new Error();
      relativePath = requested.pathname.slice(prefix.length);
      if (!/^\/[^/]+\/[^/]+\.git\/(info\/refs|git-upload-pack|git-receive-pack)$/.test(relativePath) ||
          !["GET", "POST"].includes(req.method)) throw new Error();
    } catch {
      res.writeHead(403); res.end("Only the configured Gitea Git service is available.");
      return;
    }
    const headers = forwardHeaders(req.headers);
    headers.host = target.host;
    const client = target.protocol === "https:" ? https : http;
    const upstream = client.request(target, {
      method: req.method,
      path: `${target.pathname.replace(/\/$/, "")}${relativePath}${requested.search}`,
      headers, agent: false
    }, response => {
      res.writeHead(response.statusCode, forwardHeaders(response.headers));
      response.pipe(res);
      response.on("error", () => res.destroy());
    });
    upstreams.add(upstream);
    upstream.setTimeout(20_000, () => upstream.destroy(new Error("Gitea transport timed out.")));
    upstream.on("close", () => upstreams.delete(upstream));
    upstream.on("error", () => {
      if (!res.headersSent) { res.writeHead(502); res.end("Gitea is unavailable from the app server."); }
      else res.destroy();
    });
    req.on("aborted", () => upstream.destroy());
    res.on("close", () => { if (!res.writableFinished) upstream.destroy(); });
    req.pipe(upstream);
  });
  proxy.requestTimeout = 45_000;
  proxy.headersTimeout = 10_000;
  proxy.on("clientError", (_, socket) => socket.destroy());
  proxy.on("connect", (req, socket, head) => {
    // TLS remains end-to-end: Git validates Gitea's certificate itself.
    const allowed = [internal, target].filter(url => url.protocol === "https:").map(url => `${url.hostname}:${url.port || 443}`);
    if (target.protocol !== "https:" || !allowed.includes(req.url)) { socket.destroy(); return; }
    const upstream = net.connect({ host: target.hostname, port: Number(target.port || 443) });
    upstreams.add(upstream);
    upstream.setTimeout(20_000, () => upstream.destroy());
    upstream.on("connect", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    upstream.on("close", () => { upstreams.delete(upstream); socket.destroy(); });
    socket.on("close", () => upstream.destroy());
  });

  const stop = () => {
    if (!alive) return;
    alive = false;
    readyReject(relayError(startupDiagnostic));
    for (const upstream of upstreams) upstream.destroy();
    for (const socket of [...sockets.values()]) socket.destroy();
    proxy.closeAllConnections();
    child.stdin.destroy();
    child.kill("SIGTERM");
    setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 500).unref();
  };
  child.on("error", error => {
    startupDiagnostic = error.code === "ENOENT" ? "Docker CLI is unavailable." : "Docker exec could not be started.";
    stop();
  });
  child.on("close", stop);
  child.stdin.on("error", stop);
  // The listener has no credentials. Retain only sanitized startup diagnostics;
  // Git bodies/headers and relay traffic are never written to a log.
  child.stderr.on("data", bytes => {
    if (!port && startupDiagnostic.length < 600) startupDiagnostic += bytes.toString("utf8").slice(0, 600 - startupDiagnostic.length);
  });
  child.stdout.on("data", bytes => {
    carry += bytes.toString("utf8");
    if (carry.length > 262144) { stop(); return; }
    let newline;
    while ((newline = carry.indexOf("\n")) >= 0) {
      const line = carry.slice(0, newline);
      carry = carry.slice(newline + 1);
      let frame;
      try { frame = JSON.parse(line); } catch { stop(); return; }
      if (frame.type === "ready") {
        port = Number(frame.port);
        if (!Number.isInteger(port) || port < 1024 || port > 65535) { stop(); return; }
        readyResolve();
      } else if (frame.type === "open") {
        if (sockets.size >= 8 || !Number.isSafeInteger(frame.id)) { stop(); return; }
        const socket = new RelaySocket(frame.id);
        socket.on("error", () => {});
        sockets.set(frame.id, socket);
        proxy.emit("connection", socket);
      } else {
        const socket = sockets.get(frame.id);
        if (!socket) continue;
        if (frame.type === "data") {
          if (String(frame.data).length > 65536) { socket.destroy(); continue; }
          if (!socket.push(Buffer.from(frame.data, "base64"))) send({ type: "pause", id: frame.id });
        } else if (frame.type === "end") socket.push(null);
        else if (frame.type === "close") socket.destroy();
        else if (frame.type === "ack" && socket.pending?.seq === frame.seq) socket.pending.done();
      }
    }
  });
  const timer = setTimeout(stop, 7_000).unref();
  try { await ready; } catch (error) { stop(); throw error; } finally { clearTimeout(timer); }
  return {
    scope: `${internal.origin}/`, scopes: [...origins].map(origin => `${origin}/`),
    proxyUrl: `http://127.0.0.1:${port}`,
    get alive() { return alive; }, close: stop
  };
}

export async function ensureCollaborationGitRelay(sandbox) {
  if (String(sandbox.mode).toUpperCase() !== "COLLABORATION") return null;
  const name = sandbox.containerName;
  if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/i.test(name || "")) throw relayError();
  const existing = relays.get(name);
  if (existing) {
    const relay = await existing;
    if (relay.alive) return relay;
    if (relays.get(name) !== existing) return ensureCollaborationGitRelay(sandbox);
    relays.delete(name);
  }
  const starting = openCollaborationGitRelay({ containerName: name });
  relays.set(name, starting);
  try { return await starting; } catch (error) {
    if (relays.get(name) === starting) relays.delete(name);
    throw error;
  }
}

export async function reconnectCollaborationGitRelay(sandbox) {
  const relay = await ensureCollaborationGitRelay(sandbox);
  if (!relay) return;
  // Reattach healthy clones after an app restart without fetching/resetting work.
  await runDocker([
    "exec", "--user", SANDBOX_USER.dockerUser, "--workdir", "/workspace", sandbox.containerName,
    "/bin/bash", "-c", 'if [ -d /workspace/team-repo/.git ]; then proxy="$1"; shift; for key; do git -C /workspace/team-repo config --local "$key" "$proxy" || exit $?; done; fi',
    "gitstack-git-relay", relay.proxyUrl, ...relay.scopes.map(scope => `http.${scope}.proxy`)
  ], { timeoutMs: 7_000 });
}

export async function closeAllCollaborationGitRelays() {
  const active = [...relays.values()];
  relays.clear();
  for (const pending of active) { try { (await pending).close(); } catch {} }
}
