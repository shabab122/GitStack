import { randomUUID } from "node:crypto";
import path from "node:path";
import { hintLayerCosts, hintPenaltySchedule } from "./mission-hint-xp.js";
import { missionHintLayers } from "./mission-instructor-clues.js";
import { classifyCommand, compileStep } from "./mission-step-engine.js";
import { evaluateSequentialMissionCommand, getMissionProgress, getMissionStepCount } from "./mission-terminal-policy.js";
import { runFixedSandboxCommand } from "./sandbox-exec.js";

export const HINT_COST_XP = 10; // Only for pre-upgrade attempts already charged immediately.
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

// Clues are based on the SAME verified next command as the answer, including
// the next sub-action of a compound step. Only purchased layers leave the server.
export function hintLayersForCommand(answer) {
  const command = answer.replace(/^Run: /, "");
  const { kind, file, branch, target } = classifyCommand(command);
  const clues = {
    cd: [
      "First work inside the repository folder prepared for this mission.",
      `Use the shell's directory-changing command to enter ${target}.`,
      "আগে মিশনের জন্য তৈরি repository folder-এ যান।",
      `Shell-এর directory বদলানোর command দিয়ে ${target}-এ যান।`
    ],
    init: ["This folder needs local Git metadata before you can track changes.", "Use Git's init subcommand and choose main as the initial branch.", "পরিবর্তন track করতে আগে এই folder-এ Git metadata তৈরি করতে হবে।", "Git-এর init subcommand দিয়ে main-কে প্রথম branch হিসেবে নির্বাচন করুন।"],
    clone: ["Start with a local copy of the prepared remote repository.", "Use Git's clone subcommand with the source repository and destination folder named in the step.", "আগে প্রস্তুত remote repository-এর একটি local copy নিন।", "Git-এর clone subcommand-এ ধাপে বলা source repository ও destination folder ব্যবহার করুন।"],
    "file-create": ["The required file must exist in the working directory before you can stage it.", command.startsWith("touch ") ? `Use the shell's touch command to create ${file}.` : `Append a short line of text to ${file} using shell output redirection.`, "Staging-এর আগে প্রয়োজনীয় file-টি working directory-তে তৈরি করুন।", command.startsWith("touch ") ? `Shell-এর touch command দিয়ে ${file} তৈরি করুন।` : `Shell output redirection দিয়ে ${file}-এ ছোট একটি লাইন যোগ করুন।`],
    "file-edit": ["Update the required file in your working directory.", `Use a shell text-editing command to change ${file || "the file named in the step"}.`, "Working directory-র প্রয়োজনীয় file-টি পরিবর্তন করুন।", `Shell-এর text-editing command দিয়ে ${file || "ধাপে বলা file"} বদলান।`],
    add: ["Select the working changes that should go into your next snapshot.", `Use Git's add subcommand to stage ${file === "-A" ? "all current changes" : file}.`, "পরের snapshot-এ কোন পরিবর্তন থাকবে তা নির্বাচন করুন।", `Git-এর add subcommand দিয়ে ${file === "-A" ? "সব বর্তমান পরিবর্তন" : file} stage করুন।`],
    commit: ["Save the staged changes as a permanent point in local history.", "Use Git's commit subcommand with its message option and a meaningful description of the work.", "Staging-এর পরিবর্তনগুলো local history-তে স্থায়ীভাবে সংরক্ষণ করুন।", "Git-এর commit subcommand-এর message option-এ কাজের অর্থপূর্ণ বর্ণনা দিন।"],
    status: ["Inspect the current state of your working tree and staging area.", "Use Git's status subcommand; it reports staged, unstaged and untracked work.", "Working tree ও staging area-র বর্তমান অবস্থা দেখুন।", "Git-এর status subcommand staged, unstaged ও untracked কাজ দেখায়।"],
    diff: ["Inspect the actual lines that changed before deciding what to keep.", "Use Git's diff subcommand to compare working changes with the index.", "কোন পরিবর্তন রাখবেন তা ঠিক করার আগে বদলানো লাইনগুলো দেখুন।", "Git-এর diff subcommand দিয়ে working changes ও index তুলনা করুন।"],
    log: ["Review the commits recorded in the repository's history.", "Use Git's log subcommand with the compact one-line display option.", "Repository history-তে সংরক্ষিত commit-গুলো দেখুন।", "Git-এর log subcommand-এ compact one-line display option ব্যবহার করুন।"],
    "branch-create": ["Give this work its own branch before making feature changes.", "Use Git's switch subcommand with its create option and the required branch name or prefix.", "Feature-এর পরিবর্তনের আগে কাজটির জন্য আলাদা branch তৈরি করুন।", "Git-এর switch subcommand-এর create option-এ প্রয়োজনীয় branch name বা prefix দিন।"],
    "branch-switch": ["Make the required branch active before continuing.", `Use Git's switch subcommand to activate ${branch}.`, "পরের কাজের আগে প্রয়োজনীয় branch-টি সক্রিয় করুন।", `Git-এর switch subcommand দিয়ে ${branch} সক্রিয় করুন।`],
    "branch-delete": ["Remove the finished branch after its work has been merged.", `Use Git's branch subcommand with the safe delete option for ${branch}.`, "Merge হওয়া কাজের branch-টি সরিয়ে ফেলুন।", `Git-এর branch subcommand-এর safe delete option দিয়ে ${branch} সরান।`],
    merge: ["Integrate the completed feature history into the current branch.", `Use Git's merge subcommand with the existing source branch ${branch}.`, "শেষ করা feature-এর history বর্তমান branch-এ যুক্ত করুন।", `Git-এর merge subcommand-এ source branch ${branch} ব্যবহার করুন।`],
    restore: ["Discard the accidental working-file edit using the committed version.", `Use Git's restore subcommand for ${file}.`, "Commit করা version থেকে file এনে ভুল working edit সরান।", `Git-এর restore subcommand দিয়ে ${file} ফিরিয়ে আনুন।`],
    push: ["Publish the committed local history to the configured remote.", "Use Git's push subcommand with the mission's remote and main branch.", "Commit করা local history configured remote-এ পাঠান।", "Git-এর push subcommand-এ মিশনের remote ও main branch ব্যবহার করুন।"],
    pull: ["Bring the remote branch's latest history into your current branch.", "Use Git's pull subcommand with the mission's remote and main branch.", "Remote branch-এর নতুন history বর্তমান branch-এ আনুন।", "Git-এর pull subcommand-এ মিশনের remote ও main branch ব্যবহার করুন।"],
    fetch: ["Download remote history before integrating it locally.", "Use Git's fetch subcommand with origin.", "Local branch-এ যুক্ত করার আগে remote history আনুন।", "Git-এর fetch subcommand-এ origin ব্যবহার করুন।"],
    stash: ["Temporarily set aside your unfinished working changes.", "Use Git's stash push subcommand and include untracked files with a descriptive message.", "অসম্পূর্ণ working changes সাময়িকভাবে রেখে দিন।", "Git-এর stash push subcommand-এ untracked files ও বর্ণনামূলক message অন্তর্ভুক্ত করুন।"],
    "tag-create": ["Mark the current committed milestone with a named reference.", "Use Git's tag subcommand with the version or milestone name required by the step.", "বর্তমান commit-এর milestone-কে একটি নাম দিন।", "Git-এর tag subcommand-এ ধাপে প্রয়োজনীয় version বা milestone name দিন।"],
    "branch-list": ["Inspect the repository's local branch references.", "Use Git's branch subcommand with its list option.", "Repository-র local branch reference-গুলো দেখুন।", "Git-এর branch subcommand-এর list option ব্যবহার করুন।"],
    "tag-list": ["Inspect the milestone references already recorded.", "Use Git's tag subcommand with its list option.", "আগে তৈরি milestone reference-গুলো দেখুন।", "Git-এর tag subcommand-এর list option ব্যবহার করুন।"],
    "remote-list": ["Inspect where this repository synchronizes its history.", "Use Git's remote subcommand with verbose output.", "Repository কোথায় history sync করে তা দেখুন।", "Git-এর remote subcommand-এর verbose output ব্যবহার করুন।"],
    "config-read": ["Inspect the Git settings available in this workspace.", "Use Git's config subcommand with its list option.", "এই workspace-এর Git settings দেখুন।", "Git-এর config subcommand-এর list option ব্যবহার করুন।"],
    reflog: ["Inspect the recent movements of local references.", "Use Git's reflog subcommand to review recent HEAD positions.", "Local reference-এর সাম্প্রতিক পরিবর্তন দেখুন।", "Git-এর reflog subcommand দিয়ে HEAD-এর সাম্প্রতিক অবস্থান দেখুন।"]
  };
  const [simple, detailed, simpleBn, detailedBn] = clues[kind] || [
    "Focus on the next unfinished action in this step.", "Use the Git or shell operation described in the step, with its required target.",
    "এই ধাপের পরের অসম্পূর্ণ কাজটির দিকে লক্ষ্য করুন।", "ধাপে বলা Git বা shell operation-এ প্রয়োজনীয় target ব্যবহার করুন।"
  ];
  return [
    { level: 1, text: simple, textBn: simpleBn },
    { level: 2, text: detailed, textBn: detailedBn },
    { level: 3, text: answer, textBn: `চালান: ${command}` }
  ];
}

// Lock the run before checking the current step. Recording the verified hint
// and its step-specific pending reward reduction happens in one transaction.
// Pre-upgrade attempts with paid hints retain their original immediate charge.
export async function unlockMissionHint(prisma, userId, runId, stepIndex, { terminalManager = null, level = 1 } = {}) {
  if (!Number.isInteger(level) || level < 1 || level > 3) return { error: "Choose hint level 1, 2 or 3.", status: 400 };
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
    const previousLevel = existing ? existing.hintLevel ?? 3 : 0;
    if (level > previousLevel + 1) {
      return { error: "Unlock the earlier hint layers before requesting this layer.", status: 409 };
    }
    let deferred = run.hintRewardXp != null;
    if (!deferred && !existing) {
      const priorHint = await tx.missionHintUse.findFirst({
        where: { missionRunId: runId }, select: { id: true }
      });
      if (!priorHint) {
        // An old attempt without hints can safely join the new system. Runs
        // with historical debits remain legacy so they are never charged twice.
        await tx.missionRun.update({
          where: { id: runId }, data: { hintRewardXp: run.missionTemplate.xpReward }
        });
        run.hintRewardXp = run.missionTemplate.xpReward;
        deferred = true;
      }
    }
    const rewardXp = run.hintRewardXp ?? run.missionTemplate.xpReward;
    const hintCostsXp = deferred
      ? hintPenaltySchedule(rewardXp, run.missionTemplate.instructions.steps.length)
      : Array(run.missionTemplate.instructions.steps.length).fill(HINT_COST_XP);
    const hintAccounting = deferred ? "deferred" : "immediate";
    const hintLayerCostsXp = hintCostsXp.map(hintLayerCosts);
    const charged = level > previousLevel;
    const costXp = charged ? hintLayerCostsXp[stepIndex][level - 1] : 0;
    const hintLevel = Math.max(previousLevel, level);
    if (charged) {
      if (existing) await tx.missionHintUse.update({
        where: { missionRunId_stepIndex: { missionRunId: runId, stepIndex } },
        data: { hintLevel, costXp: { increment: costXp } }
      });
      else await tx.missionHintUse.create({
        data: { id: randomUUID(), missionRunId: runId, stepIndex, costXp, hintLevel }
      });
    }
    const student = deferred || !charged
      ? await tx.user.findUnique({ where: { id: userId }, select: { xp: true } })
      : await tx.user.update({ where: { id: userId }, data: { xp: { decrement: costXp } }, select: { xp: true } });
    const uses = await tx.missionHintUse.findMany({ where: { missionRunId: runId }, select: { costXp: true } });
    const hints = missionHintLayers(run.missionTemplate, stepIndex, hintLayersForCommand(hint)).slice(0, hintLevel);
    return {
      hint: hints[level - 1].text, hints, hintLevel, charged, costXp, stepIndex,
      hintPenaltyXp: uses.reduce((sum, use) => sum + use.costXp, 0),
      hintCostsXp, hintLayerCostsXp, hintAccounting, rewardXp, xp: student?.xp
    };
  }, { maxWait: 10000, timeout: 30000 });
}
