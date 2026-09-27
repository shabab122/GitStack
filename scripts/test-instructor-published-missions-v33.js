import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const stub = pathToFileURL(fileURLToPath(new URL("./support/local-mission-sandbox-v33.js", import.meta.url))).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./sandbox-exec.js" && context.parentURL?.includes("/services/student/")) {
      return { url: stub, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

const { prepareMissionWorkspace } = await import("../services/student/mission-setup-service.js");
const { getMissionProgress, observeMissionCommand, evaluateSequentialMissionCommand } =
  await import("../services/student/mission-terminal-policy.js");
const { validateMission } = await import("../services/student/mission-validator-service.js");
const { publishedMissionContractError } = await import("../services/student/published-mission-contract.js");
const { parseTerminalCommandCompletion } = await import("../services/sandbox/terminal-command-completion.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitstack-published-missions-"));
globalThis.__missionTestRoot = root;
fs.writeFileSync(path.join(root, "gitconfig"), "[user]\n name = GitStack Test\n email = test@gitstack.local\n");

function mission(slug, steps, rules) {
  return { slug, title: slug, instructions: { workspace: "/workspace", steps }, validationRules: rules };
}

const recovery = mission("repository-recovery-lab", [
  "Inspect the repository state and identify pending changes",
  "Create the required project documentation file",
  "Stage the completed work for commit",
  "Commit the changes with a meaningful message",
  "Verify the repository is clean after completion"
], { repositoryInitialized: true, requiredFile: "README.md", fileMustBeTracked: true, minimumCommits: 1, cleanWorkingTree: true });

const feature = mission("feature-branch-integration-lab", [
  "Create a dedicated feature branch for development",
  "Add the requested feature file to the project",
  "Record the feature implementation in a commit",
  "Merge the completed feature into the main branch",
  "Verify the final repository history"
], { repositoryInitialized: true, requiredFile: "notifications.txt", fileMustBeTracked: true, minimumCommits: 1, requiredBranchPrefix: "feature/", finishOnBranch: "main", cleanWorkingTree: true });

const initialize = mission("new-repository-lab", [
  "Initialize a new Git repository with git init",
  "Create profile.html",
  "Stage profile.html with git add",
  "Commit the work with a meaningful message"
], { repositoryInitialized: true, requiredFile: "profile.html", minimumCommits: 1 });

async function runCase(definition, commands, checkpoints) {
  assert.equal(publishedMissionContractError(definition), null);
  const workspace = path.join(root, definition.slug);
  fs.mkdirSync(workspace);
  globalThis.__missionTestWorkspace = workspace;
  await prepareMissionWorkspace(definition.slug, definition.slug, definition);
  const session = { cwd: "/workspace", completedSteps: 0, stepEvidence: {}, persistedProgressPercent: 0 };

  const starting = await getMissionProgress({ sandboxId: definition.slug, missionSlug: definition.slug, session, mission: definition });
  assert.equal(starting.progressPercent, 0, `${definition.slug} started with earned progress`);
  if (definition === initialize) assert.equal(fs.existsSync(path.join(workspace, ".git")), false);
  else assert.equal(fs.existsSync(path.join(workspace, ".git")), true);

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const gate = evaluateSequentialMissionCommand({ mission: definition, command, completedSteps: session.completedSteps });
    assert.equal(gate.decision, "execute-and-validate", `${definition.slug}: ${command} -> ${gate.code}`);
    const completed = spawnSync("bash", ["-lc", command], {
      cwd: workspace, encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1", HISTFILE: "/dev/null" }
    });
    assert.equal(completed.status, 0, `${definition.slug}: ${command}: ${completed.stderr}`);
    observeMissionCommand({ missionSlug: definition.slug, command, session, mission: definition, stepIndex: gate.rule.index, commandInfo: gate.commandInfo });
    const progress = await getMissionProgress({ sandboxId: definition.slug, missionSlug: definition.slug, session, mission: definition });
    session.completedSteps = progress.completedSteps;
    session.persistedProgressPercent = progress.progressPercent;
    assert.equal(progress.progressPercent, checkpoints[index], `${definition.slug}: ${command} progress`);
  }
  const assessment = await validateMission({ sandboxId: definition.slug, missionSlug: definition.slug, mission: definition });
  assert.equal(assessment.passed, true, `${definition.slug}: ${JSON.stringify(assessment.checks)}`);
}

try {
  await runCase(recovery, [
    "git status", "touch README.md", "git add README.md", 'git commit -m "Document repository recovery"',
    "git status", "git add starter-change.txt", 'git commit -m "Resolve pending starter change"', "git status"
  ], [20, 40, 60, 80, 80, 80, 80, 100]);

  await runCase(feature, [
    "git switch -c feature/notifications", "touch notifications.txt", "git add notifications.txt",
    'git commit -m "Implement notifications feature"', "git switch main", "git merge feature/notifications", "git log --oneline"
  ], [20, 40, 40, 60, 60, 80, 100]);

  await runCase(initialize, [
    "git init -b main", "touch profile.html", "git add profile.html", 'git commit -m "Create profile page"'
  ], [25, 50, 75, 100]);

  assert.match(publishedMissionContractError(mission("bad", ["Do the project well"], { repositoryInitialized: true })), /Step 1/);
  const marker = "\u001dGITSTACK_META:0|/workspace\u001e";
  const part = parseTerminalCommandCompletion("", `Done\r\n${marker.slice(0, 8)}`);
  const rest = parseTerminalCommandCompletion(part.carry, marker.slice(8) + "student@gitstack:/workspace$ ");
  assert.equal(rest.events.length, 1);
  assert.ok(!rest.output.includes("GITSTACK_META"));
  const manager = fs.readFileSync(new URL("../services/sandbox/terminal-manager.js", import.meta.url), "utf8");
  assert.match(manager, /child\.stdout\.on\("data", forwardShellStdout\)/);
  assert.ok(!manager.includes('"HISTFILE=/workspace/.bash_history"'));
  console.log("v33 published-mission workspace, ordered progress, assessment and terminal regression passed.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
