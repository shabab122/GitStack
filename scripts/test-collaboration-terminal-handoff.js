import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("public/sandbox-terminal.js", "utf8");
const assignment = "a59a0009-e649-4065-97e5-20dbcb37cac6";
const sandboxId = "8e651346-b8cd-433e-af76-6e821797c5bb";

function page(search, { healthy = false, preparationFails = false, graphical = false, report = null } = {}) {
  const elements = new Map();
  const requests = [];
  const sockets = [];
  const windowEvents = new Map();
  const viewport = { scrollTop: 0, scrollHeight: 1200, clientHeight: 470 };
  let graphicalTerminal = null;
  let fitCalls = 0;
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
      addEventListener(name, callback) { this.handlers ||= {}; this.handlers[name] = callback; }, querySelectorAll: () => [], append() {},
      replaceChildren() {}, focus() {}, remove() { this.removed = true; }
    });
    if (name === "xtermHost") elements.get(name).querySelector = (selector) => selector === ".xterm-viewport" ? viewport : null;
    return elements.get(name);
  };
  const location = {
    search, pathname: "/sandbox-terminal.html", protocol: "http:",
    host: "localhost:3000", origin: "http://localhost:3000"
  };
  const document = {
    body: { classList: classes() }, hidden: false,
    fonts: { ready: Promise.resolve() },
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
    send(message) { this.sent ||= []; this.sent.push(JSON.parse(message)); }
  }
  const fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method || "GET" });
    if (url === "/api/auth/me") return { ok: true, status: 200, json: async () => ({ user: { fullName: "Student" } }) };
    if (url.endsWith("/report")) return report
      ? { ok: true, status: 200, json: async () => ({ report }) }
      : new Promise(() => {}); // A slow report must not block the shell.
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
  class FakeTerminal {
    constructor(options) {
      this.options = options;
      this.cols = 92;
      this.rows = 26;
      this.output = "";
      graphicalTerminal = this;
    }
    loadAddon(addon) { addon.terminal = this; }
    open(host) { this.host = host; }
    writeln(text) { this.output += text + "\r\n"; }
    write(text, callback) { this.output += text; callback?.(); }
    onData(callback) { this.onInput = callback; }
    focus() { this.focused = true; }
    scrollToBottom() { this.bottomCalls = (this.bottomCalls || 0) + 1; }
  }
  class FakeFitAddon { fit() { fitCalls += 1; } }
  const window = {
    addEventListener(name, callback) { windowEvents.set(name, callback); },
    Terminal: graphical ? FakeTerminal : null,
    FitAddon: { FitAddon: FakeFitAddon }, lucide: null, location
  };
  const context = {
    document, window, location, history: { replaceState() {} }, fetch,
    WebSocket: FakeSocket, URLSearchParams, URL,
    ResizeObserver: class { constructor() { throw new Error("The terminal must not observe and refit its own host"); } },
    setInterval: () => 1, clearInterval() {}, console
  };
  vm.runInNewContext(source, context, { filename: "sandbox-terminal.js" });
  return { elements, element, requests, sockets, windowEvents, viewport,
    terminal: () => graphicalTerminal, fits: () => fitCalls };
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

const graphical = page(`?collaboration=1&assignment=${assignment}&sandbox=${sandboxId}`, { graphical: true });
await flush();
const terminal = graphical.terminal();
assert.ok(terminal, "The browser terminal must open");
assert.equal(graphical.element("xtermHost").hidden, false);
assert.match(terminal.output, /Welcome to your GitStack team collaboration workspace/);
graphical.sockets[0].readyState = 1;
graphical.sockets[0].onmessage({ data: JSON.stringify({ type: "status", status: "connected" }) });
graphical.sockets[0].onmessage({ data: JSON.stringify({ type: "output", data: "student@gitstack:~/team-repo$ " }) });
assert.match(terminal.output, /student@gitstack:~\/team-repo\$ /, "Shell output must reach the visible graphical terminal");
assert.equal(terminal.bottomCalls, 1, "New shell output must follow the live prompt automatically");
assert.equal(graphical.viewport.scrollTop, graphical.viewport.scrollHeight, "The actual terminal viewport must show the latest result");
graphical.viewport.scrollTop = 0;
graphical.sockets[0].onmessage({ data: JSON.stringify({ type: "output", data: `\r\n${"more output\r\n".repeat(100)}` }) });
assert.equal(terminal.bottomCalls, 2, "Long running commands must keep following later output");
assert.equal(graphical.viewport.scrollTop, graphical.viewport.scrollHeight, "A full viewport must scroll down with more command output");
assert.equal(terminal.focused, true);
assert.equal(graphical.fits(), 3, "Initial display and connection must fit once each without an asynchronous resize loop");
terminal.cols = 72;
graphical.windowEvents.get("resize")();
assert.equal(graphical.sockets[0].sent.at(-1).columns, 72, "A real browser resize must update the shell width");
assert.match(readFileSync("public/sandbox-terminal.css", "utf8"), /\.xterm-host\{[^}]*height:470px/,
  "The terminal host must have a bounded height so fitting cannot grow the page indefinitely");
assert.match(readFileSync("public/sandbox-terminal.css", "utf8"), /\.xterm-viewport\{overflow-y:scroll;overscroll-behavior-y:contain\}/,
  "Collaboration terminal output must keep its own scrollable viewport");
const latestOutput = graphical.element("scrollTerminalButton");
assert.equal(latestOutput.hidden, false, "A connected student can find the latest output control");
graphical.viewport.scrollTop = 0;
latestOutput.handlers.click();
assert.equal(terminal.bottomCalls, 3, "Latest output must move the terminal viewport to the prompt");
assert.equal(graphical.viewport.scrollTop, graphical.viewport.scrollHeight);
graphical.element("terminalInput").value = "git status -sb";
graphical.element("terminalForm").handlers.submit({ preventDefault() {} });
assert.equal(terminal.bottomCalls, 4, "Running a command must return the viewport to live output");
graphical.viewport.scrollTop = 0;
terminal.onInput("x");
assert.equal(graphical.viewport.scrollTop, graphical.viewport.scrollHeight, "Typing in the graphical terminal must return to the current command");

const branchReport = page(`?collaboration=1&assignment=${assignment}&sandbox=${sandboxId}`, {
  report: {
    myRun: { role: "TEST_DEVELOPER", branch: "test/login-improvement" },
    team: { repository: { url: "http://localhost:3002/gitstack/team-project" } },
    mission: { title: "Collaboration Basics" },
    assignment: { issueNumber: 1, issueUrl: "http://localhost:3002/gitstack/team-project/issues/1" },
    stats: { totalEvents: 0 }, workflow: { percent: 0, completedSteps: 0, totalSteps: 11 }
  }
});
await flush();
assert.equal(branchReport.element("collaborationRepoLink").href,
  "http://localhost:3002/gitstack/team-project",
  "Open Gitea must lead to the team repository, including its Pull Requests");
assert.equal(branchReport.element("collaborationRepoLink").textContent, "Open Gitea");

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

console.log("Collaboration terminal handoff passed: visible output, bounded fit, shell width, immediate resume, auto-connect, stale recovery, first start and visible failure.");
