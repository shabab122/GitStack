import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("public/sandbox-terminal.js", "utf8");
const assignment = "a59a0009-e649-4065-97e5-20dbcb37cac6";
const sandboxId = "8e651346-b8cd-433e-af76-6e821797c5bb";

function page(search, { healthy = false, preparationFails = false } = {}) {
  const elements = new Map();
  const requests = [];
  const sockets = [];
  const classes = () => {
    const values = new Set();
    return {
      add: (value) => values.add(value),
      remove: (value) => values.delete(value),
      contains: (value) => values.has(value)
    };
  };
  const element = (name) => {
    if (!elements.has(name)) elements.set(name, {
      textContent: "", innerHTML: "", value: "", classList: classes(), style: {},
      addEventListener() {}, querySelectorAll: () => [], append() {},
      replaceChildren() {}, focus() {}, remove() { this.removed = true; }
    });
    return elements.get(name);
  };
  const location = {
    search, pathname: "/sandbox-terminal.html", protocol: "http:",
    host: "localhost:3000", origin: "http://localhost:3000"
  };
  const document = {
    body: { classList: classes() }, hidden: false,
    getElementById: element,
    querySelector: (selector) => element(selector),
    addEventListener() {},
    createElement: () => element(`created-${elements.size}`)
  };
  class FakeSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = FakeSocket.CONNECTING;
      sockets.push(this);
    }
    close() { this.readyState = 3; }
    send() {}
  }
  const fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method || "GET" });
    if (url === "/api/auth/me") return { ok: true, status: 200, json: async () => ({ user: { fullName: "Student" } }) };
    if (url.endsWith("/report")) return new Promise(() => {}); // A slow report must not block the shell.
    if (url.endsWith("/workspace-health")) return {
      ok: true, status: 200, json: async () => ({ workspace: {
        ready: healthy, sandboxId, sandbox: { sandboxId, mode: "COLLABORATION", running: healthy, status: healthy ? "RUNNING" : "STOPPED" }
      } })
    };
    if (url.endsWith("/start")) {
      if (preparationFails) return { ok: false, status: 503, json: async () => ({ error: "Gitea is unavailable" }) };
      return { ok: true, status: 200, json: async () => ({ workspace: {
        sandbox: { sandboxId, mode: "COLLABORATION", running: true, status: "RUNNING" }
      } }) };
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const window = { addEventListener() {}, Terminal: null, lucide: null, location };
  const context = {
    document, window, location, history: { replaceState() {} }, fetch,
    WebSocket: FakeSocket, URLSearchParams, URL,
    setInterval: () => 1, clearInterval() {}, console
  };
  vm.runInNewContext(source, context, { filename: "sandbox-terminal.js" });
  return { elements, element, requests, sockets };
}

async function flush() {
  for (let index = 0; index < 6; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

const resume = page(`?collaboration=1&assignment=${assignment}&sandbox=${sandboxId}`);
await flush();
assert.equal(resume.sockets.length, 1, "A continued workspace must open the terminal immediately");
assert.equal(resume.requests.some(({ url }) => url.endsWith("/workspace-health") || url.endsWith("/start")), false,
  "A live handoff must not block on duplicate Docker/Gitea preparation");
assert.equal(resume.element("statusValue").textContent, "Checking", "An unverified sandbox must not be presented as running");
resume.sockets[0].readyState = 1;
resume.sockets[0].onmessage({ data: JSON.stringify({ type: "status", status: "connected" }) });
assert.equal(resume.element("connectionPill").textContent, "Connected", "A ready shell must enable its command input");
assert.equal(resume.element("statusValue").textContent, "RUNNING");
assert.equal(resume.element("terminalInput").disabled, false);
assert.equal(resume.element(".nav-login").removed, true, "The team header should have no extra action");
assert.equal(resume.element(".nav-signup").textContent, "Dashboard");
assert.equal(resume.element(".site-header .brand").href, "student-dashboard.html");

const stale = page(`?collaboration=1&assignment=${assignment}&sandbox=${sandboxId}`);
await flush();
stale.sockets[0].readyState = 3;
stale.sockets[0].onclose({ code: 1006, reason: "" });
await flush();
assert.deepEqual(stale.requests.filter(({ url }) => url.endsWith("/workspace-health") || url.endsWith("/start")).map(({ method, url }) =>
  `${method} ${url.split("/").at(-1)}`), ["GET workspace-health", "POST start"],
"A failed shell must check the live clone and restore it once");
assert.equal(stale.sockets.length, 2, "The repaired workspace must connect automatically");

const fresh = page(`?collaboration=1&assignment=${assignment}`);
await flush();
assert.equal(fresh.requests.filter(({ url }) => url.endsWith("/start")).length, 1,
  "A first workspace must be prepared once");
assert.equal(fresh.requests.some(({ url }) => url.endsWith("/workspace-health")), false,
  "The start response already proves the repository is prepared");
assert.equal(fresh.sockets.length, 1, "A newly prepared workspace must auto-connect");

const failed = page(`?collaboration=1&assignment=${assignment}`, { preparationFails: true });
await flush();
assert.equal(failed.sockets.length, 0, "A failed preparation must not open an unrelated shell");
assert.match(failed.element("terminalOutput").textContent, /Gitea is unavailable/,
  "A preparation failure must be visible to the student");

console.log("Collaboration terminal handoff passed: immediate resume, auto-connect, stale recovery, first start and visible failure.");
