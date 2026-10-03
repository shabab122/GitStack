import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createInstructorRouter } from "../routes/instructor-routes.js";
import { instructorCluesForMission, missionHintLayers, storeInstructorClues } from "../services/student/mission-instructor-clues.js";

const instructorId = randomUUID();
const rows = new Map();
const prisma = {
  missionTemplate: {
    findUnique: async ({ where }) => where.id ? rows.get(where.id) || null : [...rows.values()].find((row) => row.slug === where.slug) || null,
    findMany: async () => [...rows.values()],
    create: async ({ data }) => {
      const row = { id: randomUUID(), ...data, createdBy: null, _count: { assignments: 0, missionRuns: 0 }, assignments: [], missionRuns: [] };
      rows.set(row.id, row);
      return row;
    },
    update: async ({ where, data }) => Object.assign(rows.get(where.id), data)
  },
  missionRun: { count: async () => 0 }
};
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { id: req.get("x-other-instructor") ? randomUUID() : instructorId, role: req.get("x-student") ? "STUDENT" : "INSTRUCTOR" };
  next();
});
app.use("/api/instructor", createInstructorRouter({ requireAuth: (_req, _res, next) => next(), prisma }));
app.use((error, _req, res, _next) => res.status(error.name === "ZodError" ? 400 : 500).json({ error: error.message }));
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}/api/instructor/missions`;
async function request(method, body, suffix = "", headers = {}) {
  const response = await fetch(base + suffix, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
const input = {
  title: "Optional Clue Mission", description: "Create and track a documentation file.", missionType: "INDIVIDUAL",
  level: 1, xpReward: 100, objective: "Document the project setup.",
  steps: ["Run git init", "Create README.md", "Stage README.md"],
  validationRules: { repositoryInitialized: true, requiredFile: "README.md" }, isPublished: true
};

try {
  const auto = await request("POST", input);
  assert.equal(auto.status, 201, JSON.stringify(auto.body));
  assert.deepEqual(auto.body.mission.stepClues, [null, null, null]);
  assert.equal(rows.get(auto.body.mission.id).stepHints, undefined, "automatic missions need no authored hints");

  const authored = await request("POST", { ...input, title: "Instructor Clue Mission", stepClues: [
    { text: "  Think about the repository metadata.  ", textBn: "আগে repository-র metadata তৈরি করুন।" },
    null,
    { textBn: "পরের snapshot-এর জন্য প্রয়োজনীয় file বেছে নিন।" }
  ], stepHints: ["LEGACY FULL ANSWER MUST NOT BE USED"] });
  assert.equal(authored.status, 201, JSON.stringify(authored.body));
  const id = authored.body.mission.id;
  const row = rows.get(id);
  assert.equal(row.stepHints.kind, "instructor-clues");
  assert.equal(row.stepHints.clues[0].step, input.steps[0]);
  assert.equal(authored.body.mission.stepClues[0].text, "Think about the repository metadata.");
  assert.equal(authored.body.mission.stepHints, undefined, "legacy storage is not an instructor API contract");
  const list = await request("GET");
  assert.deepEqual(list.body.missions.find((mission) => mission.id === id).stepClues, authored.body.mission.stepClues);

  const layers = [{ level: 1, text: "System clue", textBn: "System clue BN" }, { level: 2, text: "System guidance" }, { level: 3, text: "Run: git init -b main" }];
  const custom = missionHintLayers(row, 0, layers);
  assert.equal(custom[0].text, "Think about the repository metadata.");
  assert.equal(custom[0].textBn, "আগে repository-র metadata তৈরি করুন।");
  assert.deepEqual(custom.slice(1), layers.slice(1), "Guidance and Answer remain automatic");
  assert.deepEqual(missionHintLayers(row, 1, layers), layers, "an empty Clue falls back independently");
  assert.equal(missionHintLayers(row, 2, layers)[0].text, row.stepHints.clues[2].textBn, "a single language is usable in both modes");
  assert.deepEqual(instructorCluesForMission({ ...row, stepHints: ["Run: git init -b main"] }), [null, null, null], "old answers cannot become Clues");

  const savedSteps = structuredClone(row.instructions);
  const changed = await request("PATCH", { stepClues: [{ text: "New teacher wording" }, null, null] }, `/${id}`);
  assert.equal(changed.status, 200);
  assert.equal(changed.body.mission.stepClues[0].text, "New teacher wording");
  assert.deepEqual(row.instructions, savedSteps);
  assert.equal(row.xpReward, 100);
  await request("PATCH", { title: "Updated title only" }, `/${id}`);
  assert.equal(instructorCluesForMission(row)[0].text, "New teacher wording", "omitted Clues preserve existing customization");
  const removed = await request("PATCH", { stepClues: [null, null, null] }, `/${id}`);
  assert.deepEqual(removed.body.mission.stepClues, [null, null, null]);
  assert.deepEqual(missionHintLayers(row, 0, layers), layers);

  assert.equal((await request("PATCH", { stepClues: [{ text: "Unauthorized" }] }, `/${id}`, { "x-other-instructor": "1" })).status, 403);
  assert.equal((await request("POST", input, "", { "x-student": "1" })).status, 403);
  assert.equal((await request("POST", { ...input, stepClues: [null, null, null, { text: "Orphan" }] })).status, 400);
  assert.equal((await request("PATCH", { stepClues: [null, null, null, null] }, `/${id}`)).status, 400);
  assert.equal((await request("POST", { ...input, stepClues: [{ text: "x".repeat(601) }] })).status, 400);

  row.stepHints = storeInstructorClues(input.steps, [{ text: "Original first objective" }]);
  const reordered = await request("PATCH", { steps: [input.steps[1], input.steps[0], input.steps[2]] }, `/${id}`);
  assert.equal(reordered.status, 200);
  assert.deepEqual(reordered.body.mission.stepClues, [null, null, null], "objective changes cannot attach stale Clues to another step");
  console.log("Instructor Clues passed: optional create, list/edit round-trip, per-step fallback, bilingual text, system Guidance/Answer, removal, permissions, validation and objective binding.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
