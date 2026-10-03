import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";

const stub = pathToFileURL(fileURLToPath(new URL("./support/local-mission-sandbox-v33.js", import.meta.url))).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./sandbox-exec.js" && context.parentURL?.includes("/services/student/")) {
      return { url: stub, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

const { createStudentRouter } = await import("../routes/student-routes.js");
const { createInstructorRouter } = await import("../routes/instructor-routes.js");
const { activeHintStep, hintForStep, inspectMissionRepository, HINT_COST_XP } = await import("../services/student/mission-hint-service.js");
const { hintLayerCosts, hintPenaltySchedule } = await import("../services/student/mission-hint-xp.js");
const { prepareMissionWorkspace } = await import("../services/student/mission-setup-service.js");
const { evaluateSequentialMissionCommand, getMissionProgress, observeMissionCommand } = await import("../services/student/mission-terminal-policy.js");
const { compileStep } = await import("../services/student/mission-step-engine.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitstack-system-hints-"));
globalThis.__missionTestRoot = root;
fs.writeFileSync(path.join(root, "gitconfig"), "[user]\n name = GitStack Test\n email = test@gitstack.local\n");
const userId = randomUUID();
const runId = randomUUID();
const sandboxId = randomUUID();
const mission = {
  slug: "published-documentation-test", missionType: "INDIVIDUAL",
  xpReward: 100,
  instructions: { workspace: "/workspace", steps: ["Initialize a new Git repository with git init", "Create README.md", "Stage README.md", "Commit the work"] },
  validationRules: { repositoryInitialized: true, requiredFile: "README.md", minimumCommits: 1 },
  stepHints: ["DO NOT USE INSTRUCTOR TEXT", "", "", ""] // v34 legacy DB content must be ignored
};
const workspace = path.join(root, mission.slug);
fs.mkdirSync(workspace);
globalThis.__missionTestWorkspace = workspace;
const session = { cwd: "/workspace", completedSteps: 0, persistedProgressPercent: 0, stepEvidence: {}, successfulCommands: [] };
const run = {
  id: runId, userId, missionTemplate: mission, status: "IN_PROGRESS", progressPercent: 0,
  hintRewardXp: null,
  expiresAt: new Date(Date.now() + 600000),
  sandboxSessions: [{ sandboxId, status: "RUNNING", createdAt: new Date() }]
};
const student = { xp: 0 };
const purchases = new Map();
let queue = Promise.resolve();
const prisma = {
  missionRun: { findFirst: async ({ where }) => where.id === runId && where.userId === userId ? { ...run, hintUses: [...purchases.values()] } : null },
  async $transaction(work) {
    const prior = queue;
    let release;
    queue = new Promise((resolve) => { release = resolve; });
    await prior;
    try {
      return await work({
        $queryRaw: async () => [{ id: runId }],
        missionRun: {
          findFirst: async ({ where }) => where.id === runId && where.userId === userId ? run : null,
          update: async ({ data }) => Object.assign(run, data)
        },
        missionHintUse: {
          findUnique: async ({ where }) => purchases.get(where.missionRunId_stepIndex.stepIndex) || null,
          findFirst: async () => purchases.values().next().value || null,
          findMany: async () => [...purchases.values()],
          update: async ({ where, data }) => {
            const use = purchases.get(where.missionRunId_stepIndex.stepIndex);
            use.hintLevel = data.hintLevel;
            use.costXp += data.costXp.increment;
            return use;
          },
          create: async ({ data }) => {
            assert(!purchases.has(data.stepIndex), "a step was charged twice");
            purchases.set(data.stepIndex, data);
            return data;
          }
        },
        user: {
          update: async ({ data }) => { student.xp -= data.xp.decrement; return { xp: student.xp }; },
          findUnique: async () => student
        }
      });
    } finally { release(); }
  }
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: req.get("x-other-user") ? randomUUID() : userId, role: "STUDENT" }; next(); });
app.use("/api/student", createStudentRouter({
  requireAuth: (_req, _res, next) => next(), prisma,
  terminalManager: { missionSessionSnapshot: () => structuredClone(session) }
}));
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const url = `http://127.0.0.1:${server.address().port}/api/student/mission-runs/${runId}`;
async function hint(index, headers = {}, level = 1) {
  const response = await fetch(`${url}/hints/${index}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ level })
  });
  return { status: response.status, data: await response.json() };
}

async function answerHint(index) {
  let totalCost = 0;
  let result;
  for (const level of [1, 2, 3]) {
    result = await hint(index, {}, level);
    assert.equal(result.status, 200, JSON.stringify(result));
    totalCost += result.data.costXp;
  }
  return { ...result, data: { ...result.data, costXp: totalCost } };
}

async function execute(command, index, activeMission = mission) {
  const gate = evaluateSequentialMissionCommand({ mission: activeMission, command, completedSteps: index });
  assert.equal(gate.decision, "execute-and-validate", `${command} should pass the actual command gate`);
  const cwd = session.cwd === "/workspace" ? globalThis.__missionTestWorkspace :
    session.cwd.replace("/workspace", globalThis.__missionTestWorkspace);
  const process = spawnSync("bash", ["-lc", command], {
    cwd, encoding: "utf8",
    env: { ...globalThis.process.env, GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1", HISTFILE: "/dev/null" }
  });
  assert.equal(process.status, 0, `${command}: ${process.stderr}`);
  observeMissionCommand({ missionSlug: activeMission.slug, command, session, mission: activeMission, stepIndex: index, commandInfo: gate.commandInfo });
  const progress = await getMissionProgress({ sandboxId, missionSlug: activeMission.slug, mission: activeMission, session });
  session.completedSteps = progress.completedSteps;
  session.persistedProgressPercent = progress.progressPercent;
  run.progressPercent = progress.progressPercent;
  return progress;
}

try {
  assert.equal(HINT_COST_XP, 10);
  await prepareMissionWorkspace(sandboxId, mission.slug, mission);
  assert.equal(activeHintStep(run), 0);
  const detail = await fetch(url);
  assert.equal(detail.status, 200);
  assert(!JSON.stringify(await detail.json()).includes("DO NOT USE INSTRUCTOR TEXT"));
  assert.equal((await hint(1)).status, 409, "locked step does not charge");
  assert.equal((await hint(0, { "x-other-user": "1" })).status, 404);
  assert.equal((await hint(0, {}, 3)).status, 409, "the full answer cannot be bought before the earlier clues");
  assert.equal(purchases.size, 0);

  // An old attempt with an already-debited hint keeps the old accounting.
  purchases.set(-1, { id: randomUUID(), stepIndex: -1, costXp: 10 });
  student.xp = -10;
  const legacy = await answerHint(0);
  assert.equal(legacy.data.costXp, 10);
  assert.equal(legacy.data.hintAccounting, "immediate");
  assert.equal(student.xp, -20);
  purchases.clear();
  student.xp = 0;

  // An old, unhinted run upgrades on its first verified hint without debiting
  // account XP; the entire mission reward is now allocated across its steps.
  const [first, repeated] = await Promise.all([hint(0), hint(0)]);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(repeated.status, 200, JSON.stringify(repeated.data));
  assert.equal(Number(first.data.charged) + Number(repeated.data.charged), 1);
  assert.equal(first.data.hintLevel, 1);
  assert.equal(first.data.hints.length, 1);
  assert(!JSON.stringify(first.data.hints).includes("git init -b main"), "the first clue must not leak the answer");
  assert.equal(first.data.hintAccounting, "deferred");
  assert.equal(first.data.costXp + repeated.data.costXp, hintLayerCosts(hintPenaltySchedule(100, 4)[0])[0]);
  assert.equal(run.hintRewardXp, 100);
  assert.equal(student.xp, 0);
  const partialLayers = (await (await fetch(url)).json()).run;
  assert.equal(partialLayers.hintLevels[0], 1, "a partial unlock must survive reload without unlocking the answer");
  assert.equal(partialLayers.hintPenaltyXp, hintLayerCosts(hintPenaltySchedule(100, 4)[0])[0]);
  const second = await hint(0, {}, 2);
  assert.equal(second.data.hints.length, 2);
  assert(!JSON.stringify(second.data.hints).includes("git init -b main"), "closer guidance must not leak the command line");
  const [answer, repeatedAnswer] = await Promise.all([hint(0, {}, 3), hint(0, {}, 3)]);
  assert.equal(Number(answer.data.charged) + Number(repeatedAnswer.data.charged), 1);
  assert.equal(answer.data.hint, "Run: git init -b main");
  assert.equal(purchases.get(0).costXp, hintPenaltySchedule(100, 4)[0]);
  assert.equal((await hint(0, {}, 1)).data.charged, false, "reviewing an earlier layer is free");
  const persisted = (await (await fetch(url)).json()).run;
  assert.equal(persisted.hintLevels[0], 3, "unlocked layers survive a page reload");
  await execute("git init -b main", 0);
  assert.equal((await hint(0)).status, 409, "completed step cannot be purchased");
  const createHint = await answerHint(1);
  assert.equal(createHint.data.hint, "Run: touch README.md", JSON.stringify(createHint));
  await execute("touch README.md", 1);
  assert.equal((await answerHint(2)).data.hint, "Run: git add README.md");
  await execute("git add README.md", 2);
  const commitHint = await answerHint(3);
  assert.match(commitHint.data.hint, /^Run: git commit -m/);
  assert.equal(purchases.size, 4);
  assert.equal([...purchases.values()].reduce((sum, use) => sum + use.costXp, 0), 100, "all twelve layers spend the entire mission reward");
  await execute(commitHint.data.hint.slice(5), 3);
  assert.equal(run.progressPercent, 100);
  assert.equal((await hint(3)).status, 409);

  // One compound step reveals the actual next sub-action without a second fee.
  const compound = {
    slug: "compound-instructor-step", missionType: "INDIVIDUAL",
    xpReward: 25,
    instructions: { workspace: "/workspace", steps: ["Create project.md and commit it"] },
    validationRules: { requiredFile: "project.md", minimumCommits: 1 }
  };
  const compoundDir = path.join(root, compound.slug);
  fs.mkdirSync(compoundDir);
  globalThis.__missionTestWorkspace = compoundDir;
  await prepareMissionWorkspace(sandboxId, compound.slug, compound);
  run.missionTemplate = compound; run.hintRewardXp = compound.xpReward; run.progressPercent = 0;
  session.cwd = "/workspace"; session.completedSteps = 0; session.persistedProgressPercent = 0;
  session.stepEvidence = {}; session.successfulCommands = [];
  purchases.clear(); // Treat this as a new mission attempt in the route harness.
  const xpBeforeCompound = student.xp;
  let state = await inspectMissionRepository(sandboxId, compound, session);
  assert.equal(await hintForStep(compound, 0, state, session), "Run: touch project.md");
  const firstCompoundHint = await answerHint(0);
  assert.equal(firstCompoundHint.data.charged, true);
  assert.equal(firstCompoundHint.data.costXp, 25);
  assert.equal(student.xp, xpBeforeCompound);
  await execute("touch project.md", 0, compound);
  state = await inspectMissionRepository(sandboxId, compound, session);
  assert.equal(await hintForStep(compound, 0, state, session), "Run: git add project.md");
  const refreshedAdd = await hint(0, {}, 3);
  assert.equal(refreshedAdd.data.hint, "Run: git add project.md");
  assert.equal(refreshedAdd.data.charged, false);
  await execute("git add project.md", 0, compound);
  state = await inspectMissionRepository(sandboxId, compound, session);
  assert.match(await hintForStep(compound, 0, state, session), /^Run: git commit -m/);
  assert.match((await hint(0, {}, 3)).data.hint, /^Run: git commit -m/);
  assert.equal(student.xp, xpBeforeCompound, "refreshing a hint cannot debit account XP");

  const unhinted = {
    slug: "custom-git-config", missionType: "INDIVIDUAL",
    instructions: { workspace: "/workspace", steps: ["Configure local Git identity using git config"] },
    validationRules: { repositoryInitialized: true }
  };
  run.missionTemplate = unhinted; run.progressPercent = 0;
  const unavailable = await hint(0);
  assert.equal(unavailable.status, 409, JSON.stringify(unavailable));
  assert.equal(student.xp, xpBeforeCompound, "unknown next command must not cost XP");
  run.missionTemplate = {
    slug: "clean-up-unclear-work", missionType: "INDIVIDUAL",
    instructions: { workspace: "/workspace", steps: ["Finish with a clean working tree"] },
    validationRules: { repositoryInitialized: true, cleanWorkingTree: true }
  };
  assert.equal((await hint(0)).status, 409, "unknown intent for dirty work must not produce a paid no-op");
  assert.equal(student.xp, xpBeforeCompound);
  run.missionTemplate = compound;

  // The source branch in a merge hint comes from real refs, never a guessed name.
  const branchMission = {
    slug: "feature-merge-test", missionType: "INDIVIDUAL",
    instructions: { workspace: "/workspace", steps: ["Merge the feature branch into main"] },
    validationRules: { requiredBranchPrefix: "feature/" }
  };
  const branchDir = path.join(root, branchMission.slug);
  fs.mkdirSync(branchDir);
  globalThis.__missionTestWorkspace = branchDir;
  const setup = spawnSync("bash", ["-lc", "git init -b main && touch README.md && git add README.md && git commit -m starter && git switch -c feature/actual-branch && touch work.txt && git add work.txt && git commit -m feature && git switch main"], {
    cwd: branchDir, encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1" }
  });
  assert.equal(setup.status, 0, setup.stderr);
  state = await inspectMissionRepository(sandboxId, branchMission, { cwd: "/workspace" });
  assert.equal(await hintForStep(branchMission, 0, state), "Run: git merge feature/actual-branch");
  const tagMission = {
    slug: "tag-a-release", missionType: "INDIVIDUAL",
    instructions: { workspace: "/workspace", steps: ["Create tag v2.0.0"] },
    validationRules: { repositoryInitialized: true }
  };
  assert.equal(await hintForStep(tagMission, 0, state), "Run: git tag v2.0.0");
  assert.equal(evaluateSequentialMissionCommand({ mission: tagMission, command: "git tag v2.0.0", completedSteps: 0 }).allowed, true);

  async function finishWithSystemHints(definition) {
    const directory = path.join(root, definition.slug);
    fs.mkdirSync(directory);
    globalThis.__missionTestWorkspace = directory;
    await prepareMissionWorkspace(sandboxId, definition.slug, definition);
    run.missionTemplate = definition; run.progressPercent = 0;
    Object.assign(session, { cwd: "/workspace", completedSteps: 0, persistedProgressPercent: 0,
      stepEvidence: {}, successfulCommands: [], statusInspected: false, diffInspected: false,
      historyInspected: false, inspected: false, pullCompleted: false, verifiedHistory: false });
    const commands = [];
    for (let attempt = 0; attempt < 22; attempt += 1) {
      const progress = await getMissionProgress({ sandboxId, missionSlug: definition.slug, mission: definition, session });
      if (progress.complete) break;
      const index = progress.completedSteps;
      const repository = await inspectMissionRepository(sandboxId, definition, session);
      const answer = await hintForStep(definition, index, repository, session);
      assert.match(answer || "", /^Run: /, `${definition.slug} Step ${index + 1} had no command: ${JSON.stringify({ state: { cwd: repository.cwd, branch: repository.branch, changed: repository.changed, stagedPaths: repository.stagedPaths }, rule: compileStep(definition.instructions.steps[index], index, definition), commands })}`);
      const command = answer.split("\n")[0].slice(5);
      commands.push(command);
      await execute(command, index, definition);
    }
    assert.equal(run.progressPercent, 100, `${definition.slug} did not finish: ${commands.join("; ")}`);
    return commands;
  }

  const basicsCommands = await finishWithSystemHints({
    slug: "git-basics", missionType: "INDIVIDUAL",
    instructions: { workspace: "/workspace", steps: [
      "Run git init", "Create profile.html", "Stage profile.html with git add",
      "Commit it with a meaningful message", "Use git status and git log to review your work"
    ] }, validationRules: { requiredFile: "profile.html", minimumCommits: 1, minimumCommitMessageLength: 8 }
  });
  assert(basicsCommands.includes("git status") && basicsCommands.includes("git log --oneline"));
  const branchingCommands = await finishWithSystemHints({
    slug: "branching", missionType: "INDIVIDUAL",
    instructions: { workspace: "/workspace/branch-lab", steps: [
      "Enter the prepared branch-lab repository", "Create a branch whose name starts with feature/",
      "Create profile.html and commit it on the feature branch", "Switch back to main",
      "Merge the feature branch into main", "Verify the final repository history"
    ] }, validationRules: { requiredBranchPrefix: "feature/", minimumCommitsOnMain: 2, mergedIntoMain: true, finishOnMain: true }
  });
  assert(branchingCommands.includes("git merge feature/my-work"));
  const recoveryCommands = await finishWithSystemHints({
    slug: "mistake-recovery", missionType: "INDIVIDUAL",
    instructions: { workspace: "/workspace/recovery-lab", steps: [
      "Enter recovery-lab and inspect git status / git diff", "Restore notes.txt to its committed version",
      "Create recovery-note.md describing what you learned", "Stage and commit recovery-note.md",
      "Finish with a clean working tree"
    ] }, validationRules: { requiredFile: "recovery-note.md", minimumCommits: 2, cleanWorkingTree: true }
  });
  assert(recoveryCommands.includes("git restore -- notes.txt"));

  const remoteRule = {
    slug: "remote-workflow", instructions: { workspace: "/workspace/remote-lab", steps: [
      "Clone the prepared local remote repository /tmp/gitstack-origin.git into remote-lab"
    ] }, validationRules: { requiredRemotePath: "/tmp/gitstack-origin.git" }
  };
  assert.equal(await hintForStep(remoteRule, 0, {
    repoReady: false, cwd: "/workspace", branches: [], stagedPaths: [], changed: false,
    fileExists: async () => false
  }), "Run: git clone /tmp/gitstack-origin.git remote-lab");

  // Instructor input cannot supply or override hints, including old v34 payloads.
  let created = null;
  const instructorApp = express();
  instructorApp.use(express.json());
  instructorApp.use((req, _res, next) => { req.user = { id: randomUUID(), role: "INSTRUCTOR" }; next(); });
  instructorApp.use("/api/instructor", createInstructorRouter({ requireAuth: (_req, _res, next) => next(), prisma: {
    missionTemplate: { findUnique: async () => null, create: async ({ data }) => { created = data; return { id: randomUUID(), ...data, stepHints: ["UNTRUSTED LEGACY"] }; } }
  } }));
  const instructorServer = instructorApp.listen(0, "127.0.0.1");
  await new Promise((resolve) => instructorServer.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${instructorServer.address().port}/api/instructor/missions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Documentation Mission", description: "Create a documentation file.", missionType: "INDIVIDUAL",
        level: 1, xpReward: 100, objective: "Document the project setup.", steps: ["Run git init", "Create README.md"],
        stepHints: ["UNTRUSTED OVERRIDE", "UNTRUSTED OVERRIDE"], validationRules: { repositoryInitialized: true, requiredFile: "README.md" }, isPublished: true })
    });
    const responseBody = await response.json();
    assert.equal(response.status, 201, JSON.stringify(responseBody));
    assert.equal(created.stepHints, undefined);
    assert.equal(responseBody.mission.stepHints, undefined);
  } finally { await new Promise((resolve) => instructorServer.close(resolve)); }

  console.log("Three-layer system hints passed: sequential access, no answer leaks, live commands, persisted levels, concurrent unlocks, exact XP, legacy attempts, compound steps and ignored author input.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
}
