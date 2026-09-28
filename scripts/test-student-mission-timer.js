import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import express from "express";

const stubUrl = pathToFileURL(fileURLToPath(new URL("./support/mission-timer-route-stubs.js", import.meta.url))).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/routes/student-routes.js") && [
      "../services/sandbox/sandbox-service.js",
      "../services/student/mission-setup-service.js"
    ].includes(specifier)) return { url: stubUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  }
});

const { createStudentRouter } = await import("../routes/student-routes.js");
const { sandboxCalls } = await import("./support/mission-timer-route-stubs.js");
const userId = randomUUID();
const missions = [25, 120, 240, null].map((minutes, index) => ({
  id: randomUUID(), slug: `timing-${index}`, missionType: "INDIVIDUAL",
  isPublished: true, xpReward: 100, estimatedMinutes: minutes,
  instructions: { steps: ["Initialize the repository"] }
}));
const runs = [];
const prisma = {
  missionTemplate: {
    findFirst: async ({ where }) => missions.find((mission) => mission.slug === where.slug) || null
  },
  assignment: { findFirst: async () => null },
  missionRun: {
    count: async ({ where }) => runs.filter((run) => run.userId === where.userId && run.missionTemplateId === where.missionTemplateId).length,
    create: async ({ data }) => {
      const missionTemplate = missions.find((mission) => mission.id === data.missionTemplateId);
      const run = {
        ...data, id: randomUUID(), missionTemplate, sandboxSessions: [],
        hintUses: [], feedback: [], assessmentResult: null, resetCount: 0,
        submissionCount: 0, xpAwarded: 0
      };
      runs.push(run);
      return run;
    },
    findFirst: async ({ where }) => runs.find((run) =>
      (where.id == null || run.id === where.id) &&
      run.userId === where.userId &&
      (where.missionTemplateId == null || run.missionTemplateId === where.missionTemplateId) &&
      (where.status == null || run.status === where.status)) || null,
    update: async ({ where, data }) => {
      const run = runs.find((item) => item.id === where.id);
      for (const [key, value] of Object.entries(data)) {
        run[key] = value && typeof value === "object" && "increment" in value
          ? run[key] + value.increment : value;
      }
      return run;
    }
  },
  attachSandbox(runId, sandbox) {
    runs.find((run) => run.id === runId).sandboxSessions.unshift(sandbox);
  },
  resetSandbox(sandboxId, expiresAt) {
    const sandbox = runs.flatMap((run) => run.sandboxSessions).find((item) => item.sandboxId === sandboxId);
    sandbox.expiresAt = expiresAt;
    return sandbox;
  }
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: userId, role: "STUDENT" }; next(); });
app.use("/api/student", createStudentRouter({ requireAuth: (_req, _res, next) => next(), prisma }));
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}/api/student`;

async function request(path, expectedStatus, body = {}) {
  const response = await fetch(base + path, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  const result = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(result));
  return result;
}

try {
  for (const [index, mission] of missions.entries()) {
    const started = await request(`/missions/${mission.slug}/start`, 201);
    const duration = mission.estimatedMinutes ?? 30;
    assert.equal(Date.parse(started.run.expiresAt) - Date.parse(started.run.startedAt), duration * 60_000);
    assert.equal(new Date(sandboxCalls.at(-1).expiresAt).getTime(), Date.parse(started.run.expiresAt));
    assert.equal(Date.parse(started.run.sandbox.expiresAt), Date.parse(started.run.expiresAt));

    const continued = await request(`/missions/${mission.slug}/start`, 200);
    assert.equal(continued.run.id, started.run.id, "continuing an attempt keeps its original deadline");
    assert.equal(continued.run.expiresAt, started.run.expiresAt);

    const reset = await request(`/mission-runs/${started.run.id}/reset`, 200);
    assert.equal(reset.run.expiresAt, started.run.expiresAt, "reset does not grant extra time");
    assert.equal(new Date(sandboxCalls.at(-1).expiresAt).getTime(), Date.parse(started.run.expiresAt));
    assert.equal(reset.run.sandbox.expiresAt, started.run.expiresAt);

    if (index === 0) {
      const retry = await request(`/missions/${mission.slug}/start`, 201, { retry: true });
      assert.notEqual(retry.run.id, started.run.id);
      assert.equal(Date.parse(retry.run.expiresAt) - Date.parse(retry.run.startedAt), duration * 60_000);
    }
  }

  const grid = { innerHTML: "", querySelectorAll: () => [] };
  const listed = missions.map((mission) => ({
    ...mission, missionType: "individual", status: "NOT_STARTED", assignment: null
  }));
  vm.runInNewContext(readFileSync(new URL("../public/student-missions.js", import.meta.url), "utf8"), {
    window: {
      GitStackStudent: {
        ensureStudent: async () => ({ id: userId }),
        api: async () => ({ missions: listed }),
        escapeHtml: (value) => value,
        statusClass: () => "", statusLabel: () => "Not started"
      }
    },
    document: { getElementById: () => grid }
  });
  await new Promise((resolve) => setImmediate(resolve));
  for (const duration of [25, 120, 240, 30]) {
    assert(grid.innerHTML.includes(`${duration} min`), `mission list is missing ${duration} min`);
  }

  console.log("Mission timer passed: 25/120/240-minute and fallback estimates on cards and countdowns, sandbox deadlines, resume, reset and new attempts.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
