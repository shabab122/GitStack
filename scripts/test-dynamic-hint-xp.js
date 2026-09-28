import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";

import { hintPenaltySchedule, missionXpForCompletion } from "../services/student/mission-hint-xp.js";

// Instructor missions accept 0–5000 XP and 1–12 steps: verify every legal
// combination, including low-XP missions with unavoidable zero-cost steps.
for (let reward = 0; reward <= 5000; reward += 1) {
  for (let steps = 1; steps <= 12; steps += 1) {
    const costs = hintPenaltySchedule(reward, steps);
    assert.equal(costs.length, steps);
    assert.equal(costs.reduce((sum, cost) => sum + cost, 0), reward);
    assert(costs.every((cost, index) => Number.isInteger(cost) && cost >= 0 && (!index || cost >= costs[index - 1])));
    assert.equal(missionXpForCompletion(reward, costs.map((costXp) => ({ costXp })), true), 0);
    assert.equal(missionXpForCompletion(reward, [], true), reward);
  }
}
assert.deepEqual(hintPenaltySchedule(100, 8), [9, 10, 11, 12, 13, 14, 15, 16]);
assert.equal(missionXpForCompletion(100, [{ costXp: 9 }, { costXp: 16 }], true), 75);
assert.equal(missionXpForCompletion(100, [{ costXp: 10 }], false), 100, "legacy hints were already paid");

const stub = pathToFileURL(fileURLToPath(new URL("./support/hint-xp-route-stubs.js", import.meta.url))).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/routes/student-routes.js") && [
      "../services/sandbox/sandbox-service.js",
      "../services/student/mission-validator-service.js"
    ].includes(specifier)) return { url: stub, shortCircuit: true };
    return nextResolve(specifier, context);
  }
});

const { createStudentRouter } = await import("../routes/student-routes.js");
const user = { id: randomUUID(), xp: 40 };
const runs = new Map();
let transactionQueue = Promise.resolve();

function makeRun({ missionId = randomUUID(), reward, steps, used = [], legacy = false }) {
  const mission = {
    id: missionId, slug: `mission-${randomUUID()}`, missionType: "INDIVIDUAL",
    xpReward: reward, instructions: { steps: Array.from({ length: steps }, () => "Check repository state") }
  };
  const run = {
    id: randomUUID(), userId: user.id, missionTemplateId: missionId, missionTemplate: mission,
    hintRewardXp: legacy ? null : reward,
    hintUses: used.map((item, stepIndex) => typeof item === "number" ? { stepIndex, costXp: item } : item),
    status: "IN_PROGRESS", progressPercent: 100, submissionCount: 0, xpAwarded: 0,
    expiresAt: new Date(Date.now() + 600_000), feedback: [], assessmentResult: null,
    sandboxSessions: [{ sandboxId: randomUUID(), status: "RUNNING" }]
  };
  runs.set(run.id, run);
  return run;
}

const prisma = {
  missionRun: {
    findFirst: async ({ where }) => runs.get(where.id) || null
  },
  user: { findUnique: async () => user },
  async $transaction(work) {
    const prior = transactionQueue;
    let release;
    transactionQueue = new Promise((resolve) => { release = resolve; });
    await prior;
    try {
      return await work({
        $queryRaw: async () => [{ id: user.id }],
        missionRun: {
          findUnique: async ({ where }) => runs.get(where.id),
          findFirst: async ({ where }) => [...runs.values()].find((run) =>
            run.userId === where.userId && run.missionTemplateId === where.missionTemplateId &&
            run.status === where.status && run.id !== where.id.not) || null,
          update: async ({ where, data }) => {
            const run = runs.get(where.id);
            for (const [key, value] of Object.entries(data)) {
              run[key] = value && typeof value === "object" && "increment" in value
                ? (run[key] || 0) + value.increment : value;
            }
            return run;
          }
        },
        missionHintUse: {
          findMany: async ({ where }) => runs.get(where.missionRunId).hintUses
        },
        assessmentResult: {
          upsert: async ({ where, create }) => {
            runs.get(where.missionRunId).assessmentResult = create;
            return create;
          }
        },
        feedback: { deleteMany: async () => {}, createMany: async () => {} },
        user: {
          update: async ({ data }) => { user.xp += data.xp.increment; return user; }
        }
      });
    } finally { release(); }
  }
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: user.id, role: "STUDENT", xp: user.xp }; next(); });
app.use("/api/student", createStudentRouter({ requireAuth: (_req, _res, next) => next(), prisma }));
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
async function submit(run) {
  const response = await fetch(`${base}/api/student/mission-runs/${run.id}/submit`, { method: "POST" });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

try {
  const firstMissionId = randomUUID();
  const fullyHinted = makeRun({ missionId: firstMissionId, reward: 100, steps: 8, used: hintPenaltySchedule(100, 8) });
  const completed = await submit(fullyHinted);
  assert.equal(completed.run.status, "COMPLETED");
  assert.equal(completed.score, 100, "mission validation still passes normally");
  assert.equal(completed.xpAwarded, 0);
  assert.equal(user.xp, 40, "all hints cannot deplete XP earned from other missions");
  await submit(fullyHinted);
  assert.equal(user.xp, 40, "repeated submission is idempotent");

  const retry = makeRun({ missionId: firstMissionId, reward: 100, steps: 8 });
  assert.equal((await submit(retry)).xpAwarded, 0, "a zero-XP completion claims the one-time mission reward");
  assert.equal(user.xp, 40);

  const partial = makeRun({ reward: 100, steps: 8, used: [{ stepIndex: 0, costXp: 9 }, { stepIndex: 7, costXp: 16 }] });
  partial.missionTemplate.xpReward = 180; // Reward is frozen when this attempt began.
  const partialResult = await submit(partial);
  assert.equal(partialResult.xpAwarded, 75);
  assert.equal(partialResult.run.mission.xpReward, 100);
  assert.equal(user.xp, 115);

  const custom = makeRun({ reward: 150, steps: 10, used: hintPenaltySchedule(150, 10) });
  assert.equal((await submit(custom)).xpAwarded, 0, "a custom 150-XP mission is fully spent by its 10 hints");
  const independent = makeRun({ reward: 150, steps: 10 });
  assert.equal((await submit(independent)).xpAwarded, 150);
  assert.equal(user.xp, 265);

  const legacy = makeRun({ reward: 100, steps: 4, used: [10], legacy: true });
  user.xp -= 10; // The old hint was charged before this upgrade.
  assert.equal((await submit(legacy)).xpAwarded, 100);
  assert.equal(user.xp, 355, "legacy hint cannot be deducted a second time");

  const simultaneous = makeRun({ reward: 100, steps: 8 });
  const [one, two] = await Promise.all([submit(simultaneous), submit(simultaneous)]);
  assert.equal(one.run.status, "COMPLETED");
  assert.equal(two.run.status, "COMPLETED");
  assert.equal(user.xp, 455, "concurrent submission can claim the reward only once");

  console.log("Dynamic hint XP passed: weighted integer schedules, built-in/custom missions, snapshot rewards, full/partial hints, zero-XP claim, legacy debits and concurrent submission.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
