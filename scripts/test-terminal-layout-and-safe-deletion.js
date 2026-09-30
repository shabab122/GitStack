import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import { parseTerminalCommandCompletion, missionPromptCommandEnv } from "../services/sandbox/terminal-command-completion.js";

process.env.GITEA_ADMIN_TOKEN ||= "test-token";
process.env.GITEA_BASE_URL ||= "http://gitea.test";
const { createInstructorRouter } = await import("../routes/instructor-routes.js");
const { createGiteaRouter } = await import("../routes/gitea-routes.js");

const source = (name) => readFileSync(name, "utf8");
const legacy = parseTerminalCommandCompletion("", "\u001dGITSTACK_META:0|/workspace\u001e$ ");
assert.deepEqual(legacy.events, [{ exitCode: 0, cwd: "/workspace" }]);
const marker = "\u001dGITSTACK_META:0|/workspace/team-repo|/dev/pts/7\u001e";
const first = parseTerminalCommandCompletion("", marker.slice(0, 23));
const last = parseTerminalCommandCompletion(first.carry, marker.slice(23) + "student@gitstack$ ");
assert.deepEqual(last.events, [{ exitCode: 0, cwd: "/workspace/team-repo", tty: "/dev/pts/7" }]);
assert.equal(last.output, "student@gitstack$ ");
assert.ok(!missionPromptCommandEnv().includes("$(tty)"), "Other missions keep their existing prompt");
assert.ok(missionPromptCommandEnv(true).includes("$(tty)"), "Team shell reports its PTY");
assert.match(source("public/sandbox-terminal.js"), /terminalDimensions[\s\S]*type: "resize"/);
assert.match(source("public/sandbox-terminal.css"), /\.sandbox-grid>\.browser-terminal-card\{min-width:0\}/);
assert.match(source("services/sandbox/terminal-manager.js"), /stty cols \$\{initialColumns\} rows \$\{initialRows\}/);
assert.match(source("services/sandbox/terminal-manager.js"), /"stty", "-F", session\.tty/);
assert.doesNotMatch(source("services/sandbox/terminal-manager.js"), /child\.stdin\.write\(`stty/);

const missionId = "11111111-1111-4111-8111-111111111111";
const instructorId = "22222222-2222-4222-8222-222222222222";
const team = { id: "33333333-3333-4333-8333-333333333333", giteaRepositoryId: 18, giteaOwner: "gitstack", giteaRepository: "team-test" };
let mission = null;
let openAssignments = 0;
let activeRuns = 0;
let linkedRuns = 0;
let preparedAssignments = 0;
let activeTeamAssignments = 0;
const actions = [];
const prisma = {
  missionTemplate: {
    findUnique: async () => mission,
    delete: async ({ where }) => { actions.push({ type: "hard-delete", where }); },
    update: async ({ data }) => { actions.push({ type: "archive", data }); }
  },
  assignment: {
    count: async ({ where }) => {
      if (where.missionTemplateId) return openAssignments;
      if (where.OR) return preparedAssignments;
      return activeTeamAssignments;
    }
  },
  missionRun: {
    count: async ({ where }) => where.missionTemplateId ? activeRuns : linkedRuns
  },
  team: {
    findFirst: async () => team,
    findMany: async () => [team],
    update: async ({ data }) => { actions.push({ type: "unlink-repository", data }); }
  }
};
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: instructorId, role: "INSTRUCTOR" }; next(); });
app.use("/api/instructor", createInstructorRouter({ requireAuth: (_req, _res, next) => next(), prisma }));
app.use("/api/gitea", createGiteaRouter({ requireAuth: (_req, _res, next) => next(), prisma }));
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const actualFetch = globalThis.fetch;
let remoteDeletions = 0;
globalThis.fetch = (url, options) => {
  if (String(url).startsWith("http://gitea.test/api/v1")) {
    if (options?.method === "DELETE") {
      remoteDeletions += 1;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(new Response(JSON.stringify([{
      id: 18, name: "team-test", owner: { login: "gitstack" }
    }]), { status: 200, headers: { "content-type": "application/json" } }));
  }
  return actualFetch(url, options);
};
const request = async (path, method = "DELETE") => {
  const response = await fetch(origin + path, { method });
  return { status: response.status, body: await response.json() };
};
try {
  mission = { id: missionId, createdById: instructorId, archivedAt: null, _count: { assignments: 0, missionRuns: 0 } };
  assert.equal((await request(`/api/instructor/missions/${missionId}`)).status, 200);
  assert.equal(actions.at(-1).type, "hard-delete");

  mission._count = { assignments: 1, missionRuns: 1 };
  openAssignments = 1;
  assert.equal((await request(`/api/instructor/missions/${missionId}`)).status, 409);
  assert.equal(actions.filter((action) => action.type === "archive").length, 0);
  openAssignments = 0;
  assert.equal((await request(`/api/instructor/missions/${missionId}`)).status, 200);
  assert.equal(actions.at(-1).type, "archive");
  assert.equal(actions.at(-1).data.isPublished, false);

  linkedRuns = 1;
  assert.equal((await request("/api/gitea/repositories/gitstack/team-test")).status, 409);
  assert.equal(remoteDeletions, 0);
  linkedRuns = 0;
  preparedAssignments = 1;
  assert.equal((await request("/api/gitea/repositories/gitstack/team-test")).status, 409);
  preparedAssignments = 0;
  activeTeamAssignments = 1;
  assert.equal((await request("/api/gitea/repositories/gitstack/team-test")).status, 409);
  activeTeamAssignments = 0;
  assert.equal((await request("/api/gitea/repositories/gitstack/team-test")).status, 200);
  assert.equal(remoteDeletions, 1);
  assert.equal(actions.at(-1).data.giteaWebhookId, null);
  const list = await request("/api/gitea/repositories", "GET");
  assert.equal(list.status, 200);
  assert.equal(list.body.repositories[0].deleteBlockReason, null);
} finally {
  globalThis.fetch = actualFetch;
  await new Promise((resolve) => server.close(resolve));
}
console.log("Terminal width protocol, protected mission history and repository deletion guards passed.");
