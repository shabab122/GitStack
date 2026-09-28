import { randomUUID } from "node:crypto";
import path from "node:path";
import { compileStep } from "./mission-step-engine.js";
import { evaluateSequentialMissionCommand, getMissionProgress, getMissionStepCount } from "./mission-terminal-policy.js";
import { runFixedSandboxCommand } from "./sandbox-exec.js";

export const HINT_COST_XP = 10;
const SAFE_NAME = /^[A-Za-z0-9._/-]+$/;

function safeName(value) {
  const name = String(value || "").trim();
  return name && SAFE_NAME.test(name) && !name.startsWith("-") &&
    !name.startsWith("/") && !name.split("/").includes("..") ? name : "";
}

function safeRemoteSource(value) {
  const source = String(value || "").trim();
  if (/^\/(?:tmp|workspace)\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(source) &&
      !source.split("/").includes("..")) return source;
  return safeName(source);
}

function workdirFor(mission) {
  const configured = String(mission?.instructions?.workspace || "").replace(/\/+$/, "");
  return /^\/workspace(?:\/[A-Za-z0-9._-]+)*$/.test(configured) ? configured : "/workspace";
}

export function activeHintStep(run) {
  const total = getMissionStepCount(run.missionTemplate.slug, run.missionTemplate);
  const count = run.missionTemplate.instructions?.steps?.length || 0;
  if (!total || !count || run.status !== "IN_PROGRESS" || run.missionTemplate.missionType !== "INDIVIDUAL") return null;
  if (run.expiresAt && new Date(run.expiresAt).getTime() <= Date.now()) return null;
  const percent = Math.max(0, Math.min(100, Number(run.progressPercent) || 0));
  if (percent >= 100) return null;
  const index = Math.round((percent / 100) * total);
  return index < count ? index : null;
}

function resumedSession(run, stepIndex) {
  return {
    cwd: stepIndex ? workdirFor(run.missionTemplate) : "/workspace",
    completedSteps: stepIndex,
    persistedProgressPercent: Number(run.progressPercent) || 0,
    stepEvidence: {},
    successfulCommands: []
  };
}

// Read-only probes inside the student's existing sandbox. No hint generation
// command is executed in the student's shell and nothing can advance a step.
export async function inspectMissionRepository(sandboxId, mission, session, execute = runFixedSandboxCommand) {
  const configured = workdirFor(mission);
  const directory = configured === "/workspace" ? "/workspace" :
    (await execute(sandboxId, ["test", "-d", configured])).exitCode === 0 ? configured : "/workspace";
  const probe = (command) => execute(sandboxId, command, { workdir: directory });
  const [repo, status, staged, branch, refs, head, merged, tags] = await Promise.all([
    probe(["git", "rev-parse", "--is-inside-work-tree"]),
    probe(["git", "status", "--porcelain"]),
    probe(["git", "diff", "--cached", "--name-only"]),
    probe(["git", "branch", "--show-current"]),
    probe(["git", "for-each-ref", "--format=%(refname:short)", "refs/heads/"]),
    probe(["git", "rev-parse", "--verify", "HEAD"]),
    probe(["git", "branch", "--merged"]),
    probe(["git", "tag", "--list"])
  ]);
  return {
    repoReady: repo.exitCode === 0 && repo.stdout.trim() === "true",
    hasCommit: head.exitCode === 0,
    directory,
    cwd: session?.cwd || "/workspace",
    changed: status.exitCode === 0 && Boolean(status.stdout.trim()),
    changedPaths: status.exitCode === 0 ? status.stdout.split("\n").map((line) => line.slice(3).trim()).filter(Boolean) : [],
    stagedPaths: staged.exitCode === 0 ? staged.stdout.split("\n").map((line) => line.trim()).filter(Boolean) : [],
    branch: branch.exitCode === 0 ? branch.stdout.trim() : "",
    branches: refs.exitCode === 0 ? refs.stdout.split("\n").map((line) => safeName(line)).filter(Boolean) : [],
    mergedBranches: merged.exitCode === 0 ? merged.stdout.split("\n").map((line) => safeName(line.replace(/^\s*\*?\s*/, ""))).filter(Boolean) : [],
    tags: tags.exitCode === 0 ? tags.stdout.split("\n").map((line) => safeName(line)).filter(Boolean) : [],
    fileExists: async (name) => {
      const file = safeName(name);
      return Boolean(file && (await execute(sandboxId, ["test", "-f", path.posix.join(directory, file)])).exitCode === 0);
    },
    directoryExists: async (name) => {
      const folder = safeName(name);
      return Boolean(folder && (await execute(sandboxId, ["test", "-d", path.posix.join(directory, folder)])).exitCode === 0);
    }
  };
}

function stepFile(rule, mission, stepIndex) {
  const explicit = safeName(rule.file);
  if (explicit) return explicit;
  const future = mission.instructions.steps.slice(stepIndex + 1)
    .map((step, index) => safeName(compileStep(step, stepIndex + index + 1, mission).file))
    .find(Boolean);
  return future || safeName(mission.validationRules?.requiredFile) || "mission-note.txt";
}

function branchToCreate(rule, state, mission) {
  const exact = safeName(rule.branch?.exact);
  if (exact) return exact;
  const prefix = safeName(rule.branch?.prefix || mission.validationRules?.requiredBranchPrefix || "feature/");
  if (!prefix) return "";
  for (let number = 1; number < 20; number += 1) {
    const branch = `${prefix}my-work${number === 1 ? "" : `-${number}`}`;
    if (!state.branches.includes(branch)) return branch;
  }
  return "";
}

function mergeSource(mission, state) {
  const prefix = safeName(mission.validationRules?.requiredBranchPrefix);
  const other = state.branches.filter((branch) => branch !== "main" && branch !== "master");
  return other.find((branch) => prefix && branch.startsWith(prefix)) || other[0] || "";
}

function messageFor(mission) {
  const minimum = Math.min(120, Math.max(8, Number(mission.validationRules?.minimumCommitMessageLength) || 0));
  const base = "Complete the requested mission change";
  return base.padEnd(minimum, " details").slice(0, 120).replaceAll('"', "");
}

// The existing gate can accept several equivalent commands. Choose one
// concrete, state-aware candidate, and verify it against that same gate.
export async function hintForStep(mission, stepIndex, state, session = {}) {
  const steps = mission?.instructions?.steps;
  if (!Array.isArray(steps) || stepIndex < 0 || stepIndex >= steps.length) return null;
  const rule = compileStep(steps[stepIndex], stepIndex, mission);
  const actions = new Set(rule.acceptedActions);
  const text = rule.text.toLowerCase();
  const file = stepFile(rule, mission, stepIndex);
  const evidence = session.stepEvidence?.[stepIndex]?.kinds || [];
  const seen = (action) => evidence.includes(action);
  const mutatingActions = ["init", "clone", "file-create", "file-edit", "add", "commit", "branch-create", "branch-switch", "branch-delete", "merge", "restore", "reset", "stash", "tag-create", "remote-manage", "config-write", "fetch", "pull", "push", "rebase", "cherry-pick", "revert", "clean", "rm", "mv"];
  const readOnlyFallback = !mutatingActions.some((action) => actions.has(action)) ||
    /\b(?:inspect|review|check|verify|track|list|show|display|view)\b/.test(text);
  const candidates = [];
  const add = (command, note = "") => { if (command) candidates.push({ command, note }); };
  const stagedFile = state.stagedPaths.includes(file);
  const fileExists = await state.fileExists(file);
  const parentReady = !file.includes("/") || await state.directoryExists?.(path.posix.dirname(file));

  if (rule.dir && actions.has("cd") && state.cwd !== workdirFor(mission)) {
    add(`cd ${rule.dir}`);
  } else if (actions.has("clone") && !state.repoReady) {
    const source = safeRemoteSource(rule.remotePath);
    const destination = safeName(rule.cloneDestination);
    if (source && destination) add(`git clone ${source} ${destination}`);
  } else if (actions.has("init") && !state.repoReady) {
    add("git init -b main");
  } else if ((actions.has("log") || actions.has("show")) && actions.has("status") && /\b(?:log|history)\b/.test(text)) {
    if (!seen("status") && !session.statusInspected) add("git status");
    if (state.hasCommit) add("git log --oneline");
  } else if (/\b(?:inspect|review|check|verify|identify)\b/.test(text) && /\b(?:status|working tree|repository state|pending changes?)\b/.test(text)) {
    if (!seen("status") && !session.statusInspected) add("git status");
    if (actions.has("diff")) add("git diff");
    add("git status");
  } else if (/\b(?:verify|finish|check)\b.*\bclean\b/.test(text)) {
    // A dirty tree alone cannot tell us whether the learner intended to keep
    // or discard the work. Do not sell a status command as its solution.
    if (!state.changed) add("git status");
  } else if (actions.has("merge") && /\b(?:merge|integrate)\b/.test(text)) {
    if (/\bmain\b/.test(text) && state.branch !== "main") add("git switch main");
    else add(mergeSource(mission, state) ? `git merge ${mergeSource(mission, state)}` : "");
  } else if (actions.has("branch-create") && !rule.fileExplicit &&
    /\b(?:create|make|dedicated|separate|new)\b.*\b(?:branch|workflow)\b/.test(text)) {
    const branch = branchToCreate(rule, state, mission);
    if (branch && state.branches.includes(branch)) add(`git switch ${branch}`);
    else if (branch) add(`git switch -c ${branch}`);
  } else if (actions.has("branch-switch") && /\b(?:switch|checkout|return)\b/.test(text)) {
    const target = safeName(rule.branch?.exact || mission.validationRules?.finishOnBranch || "main");
    if (target && state.branches.includes(target)) add(`git switch ${target}`);
  } else if (actions.has("restore") && /\b(?:restore|recover)\b/.test(text)) {
    if (fileExists) add(`git restore -- ${file}`);
  } else if (/\b(?:stage|git add)\b/.test(text) && !/\b(?:stage\s+and\s+commit|stage.*then\s+commit)\b/.test(text)) {
    if (state.changed && (fileExists || !rule.file || state.changedPaths.includes(file))) add(`git add ${rule.file ? file : "-A"}`);
  } else if (actions.has("file-create") && /\b(?:create|make|write|add|implement)\b/.test(text) && !fileExists && parentReady) {
    add(`touch ${file}`);
  } else if (actions.has("commit") && /\bcommit\b/.test(text)) {
    if (state.stagedPaths.length && (stagedFile || !rule.file)) add(`git commit -m "${messageFor(mission)}"`);
    else if (state.changed && (fileExists || !rule.file || state.changedPaths.includes(file))) add(`git add ${rule.file ? file : "-A"}`);
    else if (actions.has("file-create") && !fileExists && parentReady) add(`touch ${file}`);
  } else if (actions.has("file-create") && /\b(?:create|make|write|add|implement)\b/.test(text) && parentReady) {
    add(`printf '%s\\n' 'Mission update' >> ${file}`);
  } else if (actions.has("tag-create") && state.hasCommit) {
    const explicitTag = safeName(rule.text.match(/\b(?:tag|version)\s+(v?[0-9][A-Za-z0-9._-]*)\b/i)?.[1]);
    if (explicitTag && !state.tags.includes(explicitTag)) add(`git tag ${explicitTag}`);
    else if (!explicitTag) {
      const number = Array.from({ length: 20 }, (_, index) => index + 1).find((index) => !state.tags.includes(`mission-milestone-${index}`));
      if (number) add(`git tag mission-milestone-${number}`);
    }
  } else if (actions.has("stash") && state.changed) {
    add('git stash push -u -m "Mission work"');
  } else if (actions.has("branch-delete")) {
    const candidate = state.mergedBranches.find((branch) => branch !== state.branch && branch !== "main" && branch !== "master");
    if (candidate) add(`git branch -d ${candidate}`);
  } else if (actions.has("pull")) add(`git pull ${safeName(mission.validationRules?.requiredRemote) || "origin"} main`);
  else if (actions.has("push")) add(`git push ${safeName(mission.validationRules?.requiredRemote) || "origin"} main`);
  else if (actions.has("fetch")) add("git fetch origin");
  else if (readOnlyFallback && actions.has("diff")) add("git diff");
  else if (readOnlyFallback && actions.has("status")) add("git status");
  else if (readOnlyFallback && (actions.has("log") || actions.has("show")) && state.hasCommit) add("git log --oneline");
  else if (readOnlyFallback && actions.has("reflog") && state.hasCommit) add("git reflog");
  else if (readOnlyFallback && actions.has("branch-list")) add("git branch --list");
  else if (readOnlyFallback && actions.has("tag-list")) add("git tag --list");
  else if (readOnlyFallback && actions.has("remote-list")) add("git remote -v");
  else if (readOnlyFallback && actions.has("config-read")) add("git config --list");

  for (const { command, note } of candidates) {
    const gate = evaluateSequentialMissionCommand({ mission, command, completedSteps: stepIndex });
    if (gate.decision !== "execute-and-validate" || (gate.code === "NAVIGATION" && !command.startsWith("cd "))) continue;
    return `Run: ${command}${note ? `\n${note}` : ""}`;
  }
  return null;
}

// Lock the run before checking the current step. The command recommendation
// and -10 XP debit are one transaction; errors and unknown states never charge.
export async function unlockMissionHint(prisma, userId, runId, stepIndex, { terminalManager = null } = {}) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw`SELECT "id" FROM "MissionRun" WHERE "id" = ${runId} AND "userId" = ${userId} FOR UPDATE`;
    if (!locked.length) return { error: "Mission run not found.", status: 404 };
    const run = await tx.missionRun.findFirst({
      where: { id: runId, userId },
      include: {
        missionTemplate: true,
        sandboxSessions: { where: { status: { not: "DELETED" } }, orderBy: { createdAt: "desc" }, take: 1 }
      }
    });
    if (!run) return { error: "Mission run not found.", status: 404 };
    if (activeHintStep(run) !== stepIndex) {
      return { error: "Hints are available only for the current unfinished step of an active mission.", status: 409 };
    }
    const sandbox = run.sandboxSessions?.[0];
    if (!sandbox || sandbox.status !== "RUNNING") {
      return { error: "Connect the mission sandbox before requesting its current command.", status: 409 };
    }
    const session = terminalManager?.missionSessionSnapshot?.(sandbox.sandboxId) || resumedSession(run, stepIndex);
    session.completedSteps = Math.max(Number(session.completedSteps) || 0, stepIndex);
    session.persistedProgressPercent = Math.max(Number(session.persistedProgressPercent) || 0, Number(run.progressPercent) || 0);
    const progress = await getMissionProgress({
      sandboxId: sandbox.sandboxId, missionSlug: run.missionTemplate.slug,
      mission: run.missionTemplate, session
    });
    if (progress.completedSteps !== stepIndex) {
      return { error: "This step has advanced. Refresh the mission checklist before requesting a hint.", status: 409 };
    }
    const state = await inspectMissionRepository(sandbox.sandboxId, run.missionTemplate, session);
    const hint = await hintForStep(run.missionTemplate, stepIndex, state, session);
    if (!hint) return { error: "No verified command is available for this step in the current repository state. Review the step and reconnect the terminal.", status: 409 };
    const existing = await tx.missionHintUse.findUnique({
      where: { missionRunId_stepIndex: { missionRunId: runId, stepIndex } }
    });
    if (existing) return {
      hint, charged: false, costXp: 0, stepIndex,
      xp: (await tx.user.findUnique({ where: { id: userId }, select: { xp: true } }))?.xp
    };
    await tx.missionHintUse.create({
      data: { id: randomUUID(), missionRunId: runId, stepIndex, costXp: HINT_COST_XP }
    });
    const student = await tx.user.update({ where: { id: userId }, data: { xp: { decrement: HINT_COST_XP } }, select: { xp: true } });
    return { hint, charged: true, costXp: HINT_COST_XP, stepIndex, xp: student.xp };
  }, { maxWait: 10000, timeout: 30000 });
}
