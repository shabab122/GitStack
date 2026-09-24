import { evaluateMissionCommand, compileStep, classifyCommand, branchRequirementSatisfied } from "./mission-step-engine.js";
import { runFixedSandboxCommand } from "./sandbox-exec.js";

function normalize(command) {
  return String(command || "").trim().replace(/\s+/g, " ");
}

function result(passed, step, label, detail = "") {
  return { passed: Boolean(passed), step, label, detail };
}

async function commandOk(sandboxId, argv, workdir = "/workspace") {
  const r = await runFixedSandboxCommand(sandboxId, argv, { workdir });
  return r.exitCode === 0;
}

async function currentBranch(sandboxId, workdir) {
  const r = await runFixedSandboxCommand(sandboxId, ["git", "branch", "--show-current"], { workdir });
  return r.exitCode === 0 ? r.stdout.trim() : "";
}

async function gitBasicsState(sandboxId, session) {
  const repo = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"]);
  if (!repo) return result(false, 0, "Initialize the Git repository", "");
  const file = await commandOk(sandboxId, ["test", "-f", "/workspace/profile.html"]);
  if (!file) return result(false, 1, "Create profile.html", "");
  const tracked = await commandOk(sandboxId, ["git", "ls-files", "--error-unmatch", "profile.html"]);
  if (!tracked) return result(false, 2, "Stage profile.html", "");
  const commit = await runFixedSandboxCommand(sandboxId, ["git", "rev-list", "--count", "HEAD"]);
  if (commit.exitCode !== 0 || Number(commit.stdout.trim() || 0) < 1) {
    return result(false, 3, "Commit it with a meaningful message", "");
  }

  // Step 5 is action-based: the learner must actually review both the working
  // tree and history. Repository state alone cannot prove these actions happened.
  if (!session?.statusInspected || !session?.historyInspected) {
    return result(false, 4, "Use git status and git log to review your work", "");
  }

  return result(true, 5, "Mission steps complete");
}

async function branchingState(sandboxId, session, mission = null) {
  const wd = "/workspace/branch-lab";
  const configuredSteps = missionSteps(mission);
  const stepCount = configuredSteps.length || 6;

  if (session.cwd !== wd) {
    return result(false, 0, configuredSteps[0] || "Enter the prepared branch-lab repository", "");
  }

  const branches = await runFixedSandboxCommand(
    sandboxId,
    ["git", "for-each-ref", "--format=%(refname:short)", "refs/heads/feature/"],
    { workdir: wd }
  );
  const feature = branches.stdout.split("\n").map(v => v.trim()).find(Boolean) || "";
  if (!feature) {
    return result(false, 1, configuredSteps[1] || "Create a feature/* branch", "");
  }

  // Validate the feature work from the feature ref itself so completed progress
  // remains valid after the learner switches back to main.
  const profileOnFeature = await commandOk(
    sandboxId,
    ["git", "cat-file", "-e", `${feature}:profile.html`],
    wd
  );
  const commits = await runFixedSandboxCommand(
    sandboxId,
    ["git", "rev-list", "--count", feature],
    { workdir: wd }
  );
  if (!profileOnFeature || commits.exitCode !== 0 || Number(commits.stdout.trim() || 0) < 2) {
    return result(false, 2, configuredSteps[2] || "Create profile.html and commit it on the feature branch", "");
  }

  const branch = await currentBranch(sandboxId, wd);
  if (branch !== "main") {
    return result(false, 3, configuredSteps[3] || "Switch back to main", "");
  }

  const merged = await runFixedSandboxCommand(
    sandboxId,
    ["git", "merge-base", "--is-ancestor", feature, "main"],
    { workdir: wd }
  );
  if (merged.exitCode !== 0) {
    return result(false, 4, configuredSteps[4] || "Merge the feature branch into main", "");
  }

  // Older published Branching & Merge templates contain five visible steps.
  // The previous engine nevertheless hard-coded a hidden sixth "history" step,
  // which made those missions stop at 83% forever. Require history only when
  // the mission itself actually contains such a step.
  const historyIndex = configuredSteps.findIndex((step) =>
    /\b(?:verify|inspect|review|check)\b.*\b(?:history|log)\b|\b(?:history|git\s+log)\b/i.test(String(step || ""))
  );

  if (historyIndex >= 0) {
    const successfulHistoryCommand = Array.isArray(session.successfulCommands) &&
      session.successfulCommands.some((command) => /^git\s+(?:log|show)(?:\s|$)/.test(normalize(command)));
    const historyEvidence = session.verifiedHistory || session.historyInspected || successfulHistoryCommand;

    if (!historyEvidence) {
      return result(false, historyIndex, configuredSteps[historyIndex], "");
    }
  }

  return result(true, stepCount, "Mission steps complete");
}

async function remoteState(sandboxId, session) {
  const wd = "/workspace/remote-lab";
  const repo = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"], wd);
  if (!repo) return result(false, 0, "Clone the prepared repository", "");
  const file = await commandOk(sandboxId, ["test", "-f", `${wd}/update.txt`], wd);
  if (!file) return result(false, 1, "Create update.txt", "Create update.txt before staging or committing.");
  const commits = await runFixedSandboxCommand(sandboxId, ["git", "rev-list", "--count", "HEAD"], { workdir: wd });
  if (commits.exitCode !== 0 || Number(commits.stdout.trim() || 0) < 2) return result(false, 2, "Stage and commit update.txt", "Run git add update.txt, then git commit.");
  const fetchHead = await commandOk(sandboxId, ["test", "-f", `${wd}/.git/FETCH_HEAD`], wd);
  if (!session.pullCompleted || !fetchHead) return result(false, 3, "Pull origin/main", "");
  const local = await runFixedSandboxCommand(sandboxId, ["git", "rev-parse", "HEAD"], { workdir: wd });
  const remote = await runFixedSandboxCommand(sandboxId, ["git", "ls-remote", "--heads", "origin", "main"], { workdir: wd });
  if (!remote.stdout.startsWith(local.stdout.trim())) return result(false, 4, "Push main to origin", "Run: git push origin main");
  return result(true, 5, "Mission steps complete");
}

async function recoveryState(sandboxId, session) {
  const wd = "/workspace/recovery-lab";
  if (session.cwd !== wd) return result(false, 0, "Enter recovery-lab and inspect the change", "Run: cd recovery-lab, then inspect with git status/git diff.");
  if (!(session.inspected || session.statusInspected || session.diffInspected)) return result(false, 0, "Inspect git status / git diff", "Run git status or git diff before restoring the file.");
  const notes = await runFixedSandboxCommand(sandboxId, ["cat", "notes.txt"], { workdir: wd });
  if (notes.stdout.trim() !== "This line is correct.") return result(false, 1, "Restore notes.txt", "Restore notes.txt to its committed version.");
  const file = await commandOk(sandboxId, ["test", "-f", `${wd}/recovery-note.md`], wd);
  if (!file) return result(false, 2, "Create recovery-note.md", "Create recovery-note.md describing what you learned.");
  const tracked = await commandOk(sandboxId, ["git", "ls-files", "--error-unmatch", "recovery-note.md"], wd);
  const commits = await runFixedSandboxCommand(sandboxId, ["git", "rev-list", "--count", "HEAD"], { workdir: wd });
  if (!tracked || Number(commits.stdout.trim() || 0) < 2) return result(false, 3, "Stage and commit recovery-note.md", "Run git add recovery-note.md, then git commit.");
  const status = await runFixedSandboxCommand(sandboxId, ["git", "status", "--porcelain"], { workdir: wd });
  if (status.stdout.trim()) return result(false, 4, "Finish with a clean working tree", "Use git status and resolve remaining changes.");
  return result(true, 5, "Mission steps complete");
}


function isCommitRecoveryMission(missionSlug, mission) {
  const title = String(mission?.title || "").trim().toLowerCase();
  const slug = String(missionSlug || "").trim().toLowerCase();
  const description = String(mission?.description || "").trim().toLowerCase();
  return title === "commit recovery challenge" ||
    slug === "commit-recovery-challenge" ||
    slug.includes("commit-recovery") ||
    (title.includes("recovery") && description.includes("history"));
}

async function commitRecoveryState(sandboxId, session, mission = null) {
  const wd = "/workspace";

  const repo = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"], wd);
  const files = await runFixedSandboxCommand(
    sandboxId,
    ["bash", "-lc", "find . -maxdepth 1 -type f -not -path './.git/*' -printf '%f\\n' | head -n 1"],
    { workdir: wd }
  );
  const hasProjectFile = Boolean(files.stdout.trim());

  if (!repo || !hasProjectFile) {
    return result(false, 0, "Initialize the repository and create the required project file",
      "Initialize the repository and create the required project file.");
  }

  // Count commits reachable from ALL refs, not just the currently checked-out
  // branch. This makes validation branch-agnostic.
  const commits = await runFixedSandboxCommand(
    sandboxId,
    ["git", "rev-list", "--all", "--count"],
    { workdir: wd }
  );
  const commitCount = commits.exitCode === 0 ? Number(commits.stdout.trim() || 0) : 0;

  if (commitCount < 1) {
    return result(false, 1, "Create an initial commit containing the working project state",
      "Create the initial commit.");
  }

  if (commitCount < 2) {
    return result(false, 2, "Make and commit a second change to the project",
      "Commit a second project state.");
  }

  // Verify that at least two reachable commits represent distinct trees. This
  // prevents commit-count-only false positives.
  const trees = await runFixedSandboxCommand(
    sandboxId,
    ["bash", "-lc", "git rev-list --all --format='%T' | grep -E '^[0-9a-f]{40,64}$' | sort -u | wc -l"],
    { workdir: wd }
  );
  const distinctTrees = trees.exitCode === 0 ? Number(trees.stdout.trim() || 0) : 0;
  if (distinctTrees < 2) {
    return result(false, 2, "Make and commit a second change to the project",
      "The second commit must contain an actual project change.");
  }

  if (!(session.historyInspected || session.recoveryHistoryInspected)) {
    return result(false, 3, "Inspect the commit history and identify the previous working state",
      "Inspect repository history with git log or git show.");
  }

  // Step 5 is validated from repository state, not from an in-memory command
  // flag. A correct `git restore --source=<previous-commit> -- <file>` must
  // advance even after reconnects or when command-observation metadata is lost.
  const configuredFile = String(mission?.validationRules?.requiredFile || "").trim();
  const recoveryFile = configuredFile || files.stdout.trim();
  if (recoveryFile) {
    // A recovered working file should differ from the current (mistaken) HEAD...
    const differsFromCurrent = await runFixedSandboxCommand(
      sandboxId,
      ["git", "diff", "--quiet", "HEAD", "--", recoveryFile],
      { workdir: wd }
    );

    // ...and match at least one earlier reachable version of that file. Do not
    // assume the correct source is always exactly HEAD~1; the learner may have
    // identified a specific earlier commit from the history.
    const ancestors = await runFixedSandboxCommand(
      sandboxId,
      ["git", "rev-list", "HEAD~1"],
      { workdir: wd }
    );
    const ancestorHashes = ancestors.exitCode === 0
      ? ancestors.stdout.split("\n").map(v => v.trim()).filter(Boolean)
      : [];

    let matchesPreviousState = false;
    for (const hash of ancestorHashes) {
      const previousExists = await runFixedSandboxCommand(
        sandboxId,
        ["git", "cat-file", "-e", `${hash}:${recoveryFile}`],
        { workdir: wd }
      );
      if (previousExists.exitCode !== 0) continue;

      const matchesPrevious = await runFixedSandboxCommand(
        sandboxId,
        ["git", "diff", "--quiet", hash, "--", recoveryFile],
        { workdir: wd }
      );
      if (matchesPrevious.exitCode === 0) {
        matchesPreviousState = true;
        break;
      }
    }

    if (differsFromCurrent.exitCode === 0 || !matchesPreviousState) {
      return result(false, 4, "Safely recover the required file without deleting the existing commit history", "");
    }
  }

  // The recovery must leave the original history reachable. We require at least
  // the two pre-recovery commits to remain reachable from refs.
  const reachableAfterRecovery = await runFixedSandboxCommand(
    sandboxId,
    ["git", "rev-list", "--all", "--count"],
    { workdir: wd }
  );
  const reachableCount = reachableAfterRecovery.exitCode === 0
    ? Number(reachableAfterRecovery.stdout.trim() || 0)
    : 0;
  if (reachableCount < 2) {
    return result(false, 4, "Safely recover the required file without deleting the existing commit history",
      "The recovery must preserve the existing commit history.");
  }

  // A real recovery commit must add another reachable commit. We do not care
  // which branch the learner used.
  if (commitCount < 3) {
    return result(false, 5, "Create a recovery commit with a meaningful message",
      "Stage the recovered state and create a recovery commit.");
  }

  // Require a clean worktree for final completion.
  const status = await runFixedSandboxCommand(
    sandboxId,
    ["git", "status", "--porcelain"],
    { workdir: wd }
  );
  if (status.stdout.trim()) {
    return result(false, 6, "Verify that the working tree is clean and the recovered project is correct",
      "The working tree is not clean yet.");
  }

  if (!(session.statusInspected || session.recoveryFinalVerified)) {
    return result(false, 6, "Verify that the working tree is clean and the recovered project is correct",
      "Run git status to verify the final working tree.");
  }

  return result(true, 7, "Mission steps complete");
}

const commitRecoveryAllowed = [
  c => /^(?:git init(?:\s|$)|touch [A-Za-z0-9._/-]+|(?:printf|echo) .*(?:>|>>)\s*[A-Za-z0-9._/-]+)$/.test(c),
  c => /^(?:git add(?:\s+.+)?|git commit\s+-m\s+.+|git status(?:\s|$))/.test(c),
  c => /^(?:(?:printf|echo) .*(?:>|>>)\s*[A-Za-z0-9._/-]+|touch [A-Za-z0-9._/-]+|git add(?:\s+.+)?|git commit\s+-m\s+.+|git status(?:\s|$)|git diff(?:\s|$))/.test(c),
  c => /^git (?:log|show)(?:\s|$)/.test(c),
  c => /^(?:git restore(?:\s+--source=[^\s]+)?\s+.+|git checkout\s+[^\s]+\s+--\s+.+|git show\s+[^\s:]+:[^\s]+\s*>\s*[A-Za-z0-9._/-]+)$/.test(c),
  c => /^(?:git add(?:\s+.+)?|git commit\s+-m\s+.+|git status(?:\s|$)|git diff(?:\s|$))/.test(c),
  c => /^git (?:status|diff|log|show)(?:\s|$)/.test(c)
];

const allowed = {
  "git-basics": [
    c => /^git init(?:\s|$)/.test(c),
    c => /^(?:touch profile\.html|(?:printf|echo) .*(?:>|>>)\s*profile\.html)$/.test(c),
    c => /^git add(?:\s+--)?\s*profile\.html$/.test(c),
    c => /^git commit\s+-m\s+.+/.test(c),
    c => /^git (?:status|log)(?:\s|$)/.test(c)
  ],
  branching: [
    c => /^cd (?:\/workspace\/)?branch-lab\/?$/.test(c),
    c => /^git (?:switch -c|checkout -b) feature\/[A-Za-z0-9._/-]+$/.test(c),
    c => /^(?:touch profile\.html|(?:printf|echo) .*(?:>|>>)\s*profile\.html|git add(?:\s+(?:-A|--all|\.|(?:--\s+)?profile\.html))|git commit\s+-m\s+.+)$/.test(c),
    c => /^git (?:switch|checkout) main$/.test(c),
    c => /^git merge(?:\s+--no-ff)?\s+feature\/[A-Za-z0-9._/-]+$/.test(c),
    c => /^git log(?:\s|$)/.test(c)
  ],
  "remote-workflow": [
    c => /^git clone \/tmp\/gitstack-origin\.git(?:\s+remote-lab)?$/.test(c),
    c => /^(?:cd (?:\/workspace\/)?remote-lab\/?|touch update\.txt|(?:printf|echo) .*(?:>|>>)\s*update\.txt)$/.test(c),
    c => /^(?:git add(?:\s+--)?\s*update\.txt|git commit\s+-m\s+.+)$/.test(c),
    c => /^git pull origin main$/.test(c),
    c => /^git push(?:\s+-u)?\s+origin main$/.test(c)
  ],
  "mistake-recovery": [
    c => /^(?:cd (?:\/workspace\/)?recovery-lab\/?|git (?:status|diff)(?:\s|$))/.test(c),
    c => /^git (?:restore notes\.txt|checkout -- notes\.txt)$/.test(c),
    c => /^(?:touch recovery-note\.md|(?:printf|echo) .*(?:>|>>)\s*recovery-note\.md)$/.test(c),
    c => /^(?:git add(?:\s+--)?\s*recovery-note\.md|git commit\s+-m\s+.+)$/.test(c),
    c => /^git status(?:\s|$)/.test(c)
  ]
};


function missionSteps(mission) {
  return Array.isArray(mission?.instructions?.steps)
    ? mission.instructions.steps.map((step) => String(step || "").trim()).filter(Boolean)
    : [];
}

function stepFile(step) {
  const matches = String(step || "").match(/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:md|txt|html|css|js|json|py|sh|yml|yaml|ts|tsx|jsx)/g);
  return matches?.[0] || "";
}

function inferredMissionWorkdir(mission, session) {
  const configured = String(mission?.instructions?.workspace || "").trim().replace(/\/+$/, "");
  if (configured.startsWith("/workspace")) return configured || "/workspace";

  const steps = missionSteps(mission);
  for (let index = 0; index < steps.length; index += 1) {
    const rule = compileStep(steps[index], index, mission);
    if (rule.dir) return `/workspace/${String(rule.dir).replace(/^\/workspace\//, "").replace(/^\/+/, "")}`;
  }
  return session.cwd && session.cwd.startsWith("/workspace") ? session.cwd : "/workspace";
}

async function genericStepSatisfied({ sandboxId, mission, session, step, index }) {
  const text = String(step || "").toLowerCase();
  const wd = inferredMissionWorkdir(mission, session);
  const rules = mission?.validationRules && typeof mission.validationRules === "object"
    ? mission.validationRules
    : {};
  const file = stepFile(step) || String(rules.requiredFile || "").trim();
  const compiled = compileStep(step, index, mission);
  const evidence = session?.stepEvidence?.[index] || { kinds: [], commands: [], details: [] };
  const observed = (kind) => Array.isArray(evidence.kinds) && evidence.kinds.includes(kind);
  const observedDetails = (kind) =>
    Array.isArray(evidence.details) ? evidence.details.filter((item) => item?.kind === kind) : [];
  const actions = new Set(compiled.acceptedActions || []);

  // Common multi-action steps must satisfy the whole requirement before
  // progression. This prevents "initialize repository and create file" from
  // completing after git init alone, and prevents "create and switch branch"
  // from completing merely because the branch exists.
  if (actions.has("init") && actions.has("file-create") && file) {
    const repoReady = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"], wd);
    const fileReady = await commandOk(sandboxId, ["test", "-f", `${wd}/${file}`], wd);
    return repoReady && fileReady;
  }
  if (actions.has("branch-create") && actions.has("branch-switch") && /\bswitch\b/.test(text)) {
    const current = await currentBranch(sandboxId, wd);
    const branchRule = compiled.branch;
    if (branchRule?.exact) return current === branchRule.exact;
    if (branchRule?.prefix) return current.startsWith(branchRule.prefix);
    return Boolean(current && !["main", "master"].includes(current));
  }

  // Directory-only navigation step.
  if (/\b(?:enter|open|work in|go to|navigate to|change (?:into|to))\b/.test(text) && !/\b(?:status|diff|commit|merge|restore|create|stage)\b/.test(text)) {
    return session.cwd === wd;
  }

  // Behavioural objectives are observed passively after the real shell executes.
  if (/\b(?:inspect|review|check|verify)\b/.test(text) && /\b(?:status|working tree|working directory)\b/.test(text)) {
    const inDirectory = !/\b(?:enter|open|navigate|go to)\b/.test(text) || session.cwd === wd;
    return inDirectory && Boolean(session.statusInspected || observed("status"));
  }
  if (/\b(?:inspect|review|check|verify)\b/.test(text) && /\bdiff(?:erence)?\b/.test(text)) {
    const inDirectory = !/\b(?:enter|open|navigate|go to)\b/.test(text) || session.cwd === wd;
    return inDirectory && Boolean(session.diffInspected || observed("diff"));
  }
  if (/\b(?:inspect|review|check|verify)\b/.test(text) && /\b(?:history|log|commit history)\b/.test(text)) {
    const repo = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"], wd);
    return repo && Boolean(session.historyInspected || observed("log") || observed("show") || observed("reflog"));
  }

  if (/\brestore\b/.test(text) && file) {
    const tracked = await runFixedSandboxCommand(sandboxId, ["git", "ls-files", "--error-unmatch", file], { workdir: wd });
    const cleanFile = await runFixedSandboxCommand(sandboxId, ["git", "diff", "--quiet", "HEAD", "--", file], { workdir: wd });
    return tracked.exitCode === 0 && cleanFile.exitCode === 0;
  }

  if (/\bcreate\b/.test(text) && file && !/\bcommit\b/.test(text)) {
    return commandOk(sandboxId, ["test", "-f", `${wd}/${file}`], wd);
  }

  if (actions.has("file-create") && !file && !/\bcommit\b/.test(text)) {
    for (const detail of observedDetails("file-create")) {
      const candidate = String(detail?.file || "").replace(/^\.\//, "");
      if (!candidate || candidate.startsWith("../") || candidate.includes("/../")) continue;
      if (await commandOk(sandboxId, ["test", "-f", `${wd}/${candidate}`], wd)) return true;
    }
    return false;
  }

  if (/\b(?:stage|add)\b/.test(text) && /\bcommit\b/.test(text) && file) {
    const tracked = await runFixedSandboxCommand(sandboxId, ["git", "ls-files", "--error-unmatch", file], { workdir: wd });
    const committed = await runFixedSandboxCommand(sandboxId, ["git", "log", "-1", "--format=%H", "--", file], { workdir: wd });
    return tracked.exitCode === 0 && Boolean(committed.stdout.trim());
  }

  if (/\bcommit\b/.test(text) && file) {
    const committed = await runFixedSandboxCommand(sandboxId, ["git", "log", "-1", "--format=%H", "--", file], { workdir: wd });
    return Boolean(committed.stdout.trim());
  }

  if (/\bclean\b/.test(text) && /\bworking\s+tree\b/.test(text)) {
    const status = await runFixedSandboxCommand(sandboxId, ["git", "status", "--porcelain"], { workdir: wd });
    return status.exitCode === 0 && status.stdout.trim() === "";
  }

  if (/\binitialize\b/.test(text) && /\brepositor/.test(text)) {
    return commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"], wd);
  }

  if (/\b(?:create|make).*branch\b/.test(text)) {
    const prefix =
      String(step || "").match(/\b((?:feature|recovery|bugfix|hotfix)\/)/i)?.[1] ||
      String(rules.requiredBranchPrefix || "").trim();
    const branches = await runFixedSandboxCommand(sandboxId, ["git", "for-each-ref", "--format=%(refname:short)", "refs/heads/"], { workdir: wd });
    const list = branches.stdout.split("\n").map(v => v.trim()).filter(Boolean);
    const current = await currentBranch(sandboxId, wd);
    return branchRequirementSatisfied({
      current,
      branches: list,
      rule: prefix ? { prefix } : null
    });
  }

  if (/\b(?:stage|git add)\b/.test(text) && file && !/\bcommit\b/.test(text)) {
    const staged = await runFixedSandboxCommand(sandboxId, ["git", "diff", "--cached", "--name-only", "--", file], { workdir: wd });
    return staged.exitCode === 0 && staged.stdout.split("\n").map(v=>v.trim()).includes(file);
  }

  if (/\b(?:switch|checkout|return)\b/.test(text) && /\bmain\b/.test(text)) {
    return (await currentBranch(sandboxId, wd)) === "main";
  }

  if (/\bmerge\b/.test(text) && /\bmain\b/.test(text)) {
    const branch = await currentBranch(sandboxId, wd);
    return branch === "main" && Boolean(session.mergeActionObserved);
  }

  // Compatibility for older/instructor-authored missions that use outcome prose
  // instead of literal command names. These checks use observed actions plus
  // repository state, so switching missions does not depend on hard-coded slugs.
  if (
    /\b(?:separate|isolated|independent)\b.*\b(?:development|feature)\b.*\bworkflow\b/.test(text) ||
    /\b(?:development|feature)\b.*\bworkflow\b.*\b(?:assigned|separate|isolated)\b/.test(text)
  ) {
    const branches = await runFixedSandboxCommand(
      sandboxId,
      ["git", "for-each-ref", "--format=%(refname:short)", "refs/heads/"],
      { workdir: wd }
    );
    const list = branches.stdout.split("\n").map(v => v.trim()).filter(Boolean);
    const current = await currentBranch(sandboxId, wd);
    const prefix = String(rules.requiredBranchPrefix || "").trim();
    const branchReady = branchRequirementSatisfied({
      current,
      branches: list,
      rule: prefix ? { prefix } : null
    });
    // The checked-out feature/development branch is authoritative evidence.
    // Do not require an ephemeral terminal-session flag; that flag disappears
    // on reconnect and previously left a correct `git switch -c feature/...`
    // stuck on the same step.
    return branchReady;
  }

  if (/\b(?:implement|develop|apply|make)\b.*\b(?:required\s+)?(?:project\s+)?(?:change|changes|feature|modification|modifications)\b/.test(text)) {
    if (!session.fileActionObserved) return false;
    if (file) {
      return commandOk(sandboxId, ["test", "-f", `${wd}/${file}`], wd);
    }
    const status = await runFixedSandboxCommand(sandboxId, ["git", "status", "--porcelain"], { workdir: wd });
    return status.exitCode === 0 && Boolean(status.stdout.trim());
  }

  if (/\b(?:track|review|inspect|check)\b.*\b(?:modification|modifications|change|changes|work)\b/.test(text)) {
    return Boolean(session.statusInspected || session.diffInspected || session.stageActionObserved);
  }

  if (/\bmeaningful\b.*\bcommit/.test(text) || /\bcommit(?:s)?\b.*\b(?:completed|work|changes)\b/.test(text)) {
    if (!session.commitActionObserved) return false;
    const countResult = await runFixedSandboxCommand(sandboxId, ["git", "rev-list", "--count", "HEAD"], { workdir: wd });
    if (countResult.exitCode !== 0 || Number(countResult.stdout.trim() || 0) < Math.max(1, Number(rules.minimumCommits || 1))) return false;
    if (Number(rules.minimumCommitMessageLength || 0) > 0) {
      const msg = await runFixedSandboxCommand(sandboxId, ["git", "log", "-1", "--pretty=%s"], { workdir: wd });
      if (msg.exitCode !== 0 || msg.stdout.trim().length < Number(rules.minimumCommitMessageLength)) return false;
    }
    return true;
  }

  if (/\bprepare\b.*\b(?:team\s+)?review\b|\bintegration\b/.test(text)) {
    if (rules.finishOnBranch) {
      const branch = await currentBranch(sandboxId, wd);
      if (branch !== String(rules.finishOnBranch)) return false;
    }
    if (rules.cleanWorkingTree) {
      const status = await runFixedSandboxCommand(sandboxId, ["git", "status", "--porcelain"], { workdir: wd });
      return status.exitCode === 0 && status.stdout.trim() === "";
    }
    return Boolean(session.commitActionObserved || session.statusInspected || session.historyInspected);
  }

  // Generic Git operations inferred by the shared compiler. Stable repository
  // state is checked wherever possible; action evidence is reserved for steps
  // whose objective is the action/inspection itself.
  if (actions.has("clone")) {
    const repo = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"], wd);
    return repo && observed("clone");
  }
  if (actions.has("fetch") || actions.has("pull")) {
    const fetchHead = await commandOk(sandboxId, ["test", "-f", `${wd}/.git/FETCH_HEAD`], wd);
    return fetchHead && (observed("fetch") || observed("pull"));
  }
  if (actions.has("push")) {
    const head = await runFixedSandboxCommand(sandboxId, ["git", "rev-parse", "HEAD"], { workdir: wd });
    const upstream = await runFixedSandboxCommand(sandboxId, ["git", "rev-parse", "@{u}"], { workdir: wd });
    return observed("push") && head.exitCode === 0 && upstream.exitCode === 0 && head.stdout.trim() === upstream.stdout.trim();
  }
  if (actions.has("tag-create")) {
    const tags = await runFixedSandboxCommand(sandboxId, ["git", "tag", "--list"], { workdir: wd });
    return observed("tag-create") && tags.exitCode === 0 && Boolean(tags.stdout.trim());
  }
  if (actions.has("tag-delete")) return observed("tag-delete");
  if (actions.has("remote-manage")) {
    const remotes = await runFixedSandboxCommand(sandboxId, ["git", "remote"], { workdir: wd });
    return observed("remote-manage") && remotes.exitCode === 0;
  }
  if (actions.has("config-write")) return observed("config-write");
  if (actions.has("stash")) {
    const stash = await runFixedSandboxCommand(sandboxId, ["git", "stash", "list"], { workdir: wd });
    return observed("stash") && stash.exitCode === 0 && Boolean(stash.stdout.trim());
  }
  if (actions.has("rebase")) {
    const repo = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"], wd);
    return repo && observed("rebase");
  }
  if (actions.has("cherry-pick") || actions.has("revert") || actions.has("reset")) {
    const repo = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"], wd);
    return repo && [...actions].some((kind) => observed(kind));
  }
  if (actions.has("branch-delete")) return observed("branch-delete");
  if (actions.has("rm") && file) {
    const exists = await commandOk(sandboxId, ["test", "-e", `${wd}/${file}`], wd);
    return observed("rm") && !exists;
  }
  if (actions.has("mv")) return observed("mv");
  if (actions.has("clean")) {
    const untracked = await runFixedSandboxCommand(sandboxId, ["git", "ls-files", "--others", "--exclude-standard"], { workdir: wd });
    return observed("clean") && untracked.exitCode === 0 && !untracked.stdout.trim();
  }

  const inspections = ["status","diff","log","show","reflog","grep","blame","branch-list","tag-list","remote-list","config-read","worktree-list"];
  if (inspections.some((kind) => actions.has(kind) && observed(kind))) return true;

  // Unknown prose must not be guessed as complete. It stays active rather than
  // leaking progress from another mission context.
  return false;
}

async function genericMissionState(sandboxId, session, mission) {
  const steps = missionSteps(mission);
  if (!steps.length) return result(false, 0, "Follow the mission instructions", "This published mission has no guided steps configured.");
  for (let index = 0; index < steps.length; index += 1) {
    if (!await genericStepSatisfied({ sandboxId, mission, session, step: steps[index], index })) {
      return result(false, index, steps[index], "Complete the active mission step.");
    }
  }
  return result(true, steps.length, "Mission steps complete");
}

export async function getMissionTerminalState({ sandboxId, missionSlug, session, mission = null }) {
  if (isCommitRecoveryMission(missionSlug, mission)) return commitRecoveryState(sandboxId, session, mission);
  if (missionSlug === "git-basics") return gitBasicsState(sandboxId, session);
  if (missionSlug === "branching") return branchingState(sandboxId, session, mission);
  if (missionSlug === "remote-workflow") return remoteState(sandboxId, session);
  if (missionSlug === "mistake-recovery") return recoveryState(sandboxId, session);
  return genericMissionState(sandboxId, session, mission);
}

export async function authorizeMissionCommand({ sandboxId, missionSlug, command, session, mission = null }) {
  const c = normalize(command);
  const state = await getMissionTerminalState({ sandboxId, missionSlug, session, mission });
  if (!c) return { allowed: true, state };
  const policy = isCommitRecoveryMission(missionSlug, mission) ? commitRecoveryAllowed : allowed[missionSlug];
  if (!policy) return { allowed: false, state, message: "This mission does not allow unrestricted terminal commands." };
  const matcher = policy[state.step];
  if (!matcher || !matcher(c)) {
    return {
      allowed: false,
      state,
      message: `Complete Step ${Math.min(state.step + 1, policy.length)} first: ${state.label}. ${state.detail || ""}`.trim()
    };
  }
  return { allowed: true, state };
}



// v14: generic sequential mission command gate.
// This is intentionally mission-data driven: it derives the currently expected command
// family from the active published/unpublished/assigned mission step text. It does not
// special-case mission slugs.
const V14_COMMAND_RULES = [
  { family: "cd", test: /\b(?:enter|go to|change (?:into|to)|navigate to)\b|\b(?:directory|folder|repository)\b/i,
    commands: [/^cd(?:\s+|$)/] },
  { family: "status", test: /\b(?:git\s+status|working tree|working-tree|clean working tree|status)\b/i,
    commands: [/^git\s+status(?:\s|$)/] },
  { family: "diff", test: /\b(?:git\s+diff|inspect .*change|view .*change|difference|diff)\b/i,
    commands: [/^git\s+diff(?:\s|$)/] },
  { family: "init", test: /\b(?:initialize|initialise|git\s+init|new git repository)\b/i,
    commands: [/^git\s+init(?:\s|$)/] },
  { family: "restore", test: /\b(?:restore|recover|revert .*file|committed version)\b/i,
    commands: [/^git\s+restore(?:\s|$)/, /^git\s+checkout\s+\S+\s+--\s+\S+/] },
  { family: "branch", test: /\b(?:create .*branch|switch .*branch|checkout .*branch|feature\/|recovery\/)\b/i,
    commands: [/^git\s+(?:switch|checkout)(?:\s|$)/, /^git\s+branch(?:\s|$)/] },
  { family: "add", test: /\b(?:stage|git\s+add|add .*staging)\b/i,
    commands: [/^git\s+add(?:\s|$)/] },
  { family: "commit", test: /\b(?:commit|meaningful message)\b/i,
    commands: [/^git\s+commit(?:\s|$)/] },
  { family: "merge", test: /\b(?:merge|integrate .*branch)\b/i,
    commands: [/^git\s+merge(?:\s|$)/] },
  { family: "log", test: /\b(?:history|git\s+log|inspect .*commit|verify .*history)\b/i,
    commands: [/^git\s+(?:log|show)(?:\s|$)/] },
  { family: "file-create", test: /\b(?:create|make).*\.(?:md|txt|html|js|json|css)\b/i,
    commands: [/^(?:touch|printf|echo|cat)\b/] }
];

function v14NormalizeCommand(command) {
  return String(command || "").trim().replace(/\s+/g, " ");
}

function v14StepText(step) {
  if (!step) return "";
  if (typeof step === "string") return step;
  return [
    step.title, step.name, step.text, step.description, step.instruction,
    step.label, step.requirement
  ].filter(Boolean).join(" ");
}

function v14MissionSteps(mission) {
  const candidates = [
    mission?.steps, mission?.tasks, mission?.requirements,
    mission?.instructions?.steps, mission?.instructions, mission?.checkpoints
  ];
  for (const value of candidates) if (Array.isArray(value) && value.length) return value;
  return [];
}

function v14ExpectedFamilies(stepText) {
  const text = String(stepText || "");
  return V14_COMMAND_RULES.filter(r => r.test.test(text)).map(r => r.family);
}

function v14CommandFamily(command) {
  const c = v14NormalizeCommand(command);
  for (const rule of V14_COMMAND_RULES) {
    if (rule.commands.some(rx => rx.test(c))) return rule.family;
  }
  if (/^git(?:\s|$)/.test(c)) return "git-other";
  if (/^[A-Za-z0-9_.\/-]+(?:\s|$)/.test(c)) return "shell-other";
  return "unknown";
}

function v14StepGuidance(stepText, expected = []) {
  const text = String(stepText || "").trim();
  const file = stepFile(text);
  const lower = text.toLowerCase();
  const hints = [];

  if (expected.includes("cd")) {
    const match = text.match(/\b(?:enter|go to|navigate to|change (?:into|to))\s+(?:the\s+)?([A-Za-z0-9._/-]+)/i);
    hints.push(match ? `Run: cd ${match[1].replace(/[.,;:]$/, "")}` : "Change into the repository/directory required by this step.");
  }
  if (expected.includes("init")) hints.push("Run git init in the required working directory.");
  if (expected.includes("branch")) {
    const prefix = text.match(/\b((?:feature|recovery|bugfix|hotfix)\/)/i)?.[1];
    hints.push(prefix ? `Create/switch to the required ${prefix} branch.` : "Create or switch to the branch required by this step.");
  }
  if (expected.includes("file-create")) hints.push(file ? `Create ${file}.` : "Create the file required by this step.");
  if (expected.includes("restore")) hints.push(file ? `Restore ${file} to the required committed state.` : "Restore the required file/state.");
  if (expected.includes("add")) hints.push(file ? `Stage it with git add ${file}.` : "Stage the required change with git add.");
  if (expected.includes("commit")) hints.push("Commit the required change with a meaningful git commit -m message.");
  if (expected.includes("merge")) hints.push("Merge the required branch only after the preceding steps are complete.");
  if (expected.includes("log")) hints.push("Inspect the required history with git log/git show.");
  if (expected.includes("status")) hints.push("Inspect the working tree with git status.");
  if (expected.includes("diff")) hints.push("Inspect the change with git diff.");

  // Keep the guidance compact and deterministic. The displayed mission step remains
  // the source of truth; this line only tells the student what kind of action is next.
  return [...new Set(hints)].join(" ") || "Follow the active step shown in Mission instructions.";
}

function v14BlockedMessage(index, stepText, expected) {
  const label = String(stepText || "").trim() || "Follow the active mission step";
  const guidance = v14StepGuidance(label, expected);
  return `[GitStack] BLOCKED: Complete Step ${index + 1} first: ${label}. ${guidance}`;
}

export function evaluateSequentialMissionCommand({ mission, command, completedSteps = 0 }) {
  const evaluated = evaluateMissionCommand({ mission, command, completedSteps });
  return {
    allowed: evaluated.decision === "execute-and-validate",
    decision: evaluated.decision,
    code: evaluated.code,
    message: evaluated.message || "",
    rule: evaluated.rule,
    commandInfo: evaluated.command
  };
}

export function observeMissionCommand({ missionSlug, command, session, mission = null, stepIndex = null, commandInfo = null }) {
  const c = normalize(command);
  if (!c) return;

  const info = commandInfo || classifyCommand(c);
  const evidenceIndex = Number.isInteger(stepIndex) ? stepIndex : Number(session?.completedSteps || 0);
  if (!session.stepEvidence || typeof session.stepEvidence !== "object") session.stepEvidence = {};
  if (!session.stepEvidence[evidenceIndex]) session.stepEvidence[evidenceIndex] = { kinds: [], commands: [], details: [] };
  const evidence = session.stepEvidence[evidenceIndex];
  if (!Array.isArray(evidence.details)) evidence.details = [];
  if (info?.kind && !evidence.kinds.includes(info.kind)) evidence.kinds.push(info.kind);
  if (!evidence.commands.includes(c)) evidence.commands.push(c);
  if (info?.kind) {
    evidence.details.push({
      kind: info.kind,
      file: info.file || "",
      branch: info.branch || "",
      source: info.source || "",
      destination: info.destination || "",
      remote: info.remote || "",
      tag: info.tag || ""
    });
  }
  if (evidence.commands.length > 30) evidence.commands.shift();
  if (evidence.details.length > 30) evidence.details.shift();

  const cdMatch = c.match(/^cd\s+([^;&|]+)$/);
  if (cdMatch) {
    const target = cdMatch[1].trim().replace(/^['"]|['"]$/g, "");
    if (target === "/workspace" || target === "~") session.cwd = "/workspace";
    else if (target.startsWith("/workspace/")) session.cwd = target.replace(/\/$/, "");
    else if (target === "..") session.cwd = session.cwd === "/workspace" ? "/workspace" : session.cwd.replace(/\/[^/]+$/, "") || "/workspace";
    else if (!target.startsWith("/")) session.cwd = `${session.cwd || "/workspace"}/${target}`.replace(/\/+/g, "/").replace(/\/$/, "");
  }

  // Generic action evidence. These events are intentionally independent of
  // command authorization: Bash/Git has already received the command.
  if (/^git (?:log|show)(?:\s|$)/.test(c)) {
    session.historyInspected = true;
    session.recoveryHistoryInspected = true;
  }
  if (/^git status(?:\s|$)/.test(c)) {
    session.statusInspected = true;
    if (session.recoveryPerformed) session.recoveryFinalVerified = true;
  }
  if (/^git diff(?:\s|$)/.test(c)) session.diffInspected = true;

  if (/^(?:git restore(?:\s|$)|git checkout\s+[^\s]+\s+--\s+|git show\s+[^\s:]+:[^\s]+\s*>)/.test(c)) {
    session.recoveryAttempted = true;
    session.recoveryPerformed = true;
  }

  if (/^git (?:switch|checkout)\s+/.test(c)) session.branchActionObserved = true;
  if (/^git merge(?:\s|$)/.test(c)) session.mergeActionObserved = true;
  if (/^git add(?:\s|$)/.test(c)) session.stageActionObserved = true;
  if (/^git commit(?:\s|$)/.test(c)) session.commitActionObserved = true;
  if (/^git init(?:\s|$)/.test(c)) session.initActionObserved = true;
  if (/^(?:touch|printf|echo|sed|tee|cp)\b/.test(c)) session.fileActionObserved = true;

  // Built-in action-based checkpoints must be observed by the same runtime
  // path used by the terminal manager. This prevents older missions from
  // becoming stuck even when the command itself executes correctly.
  if (missionSlug === "branching" && /^git (?:log|show)(?:\s|$)/.test(c)) {
    session.verifiedHistory = true;
  }
  if (missionSlug === "remote-workflow" && /^git pull(?:\s+origin\s+main)?(?:\s|$)/.test(c)) {
    session.pullCompleted = true;
  }
  if (missionSlug === "mistake-recovery" && /^git (?:status|diff)(?:\s|$)/.test(c)) {
    session.inspected = true;
  }
}

export function noteAcceptedMissionCommand({ missionSlug, command, session, mission = null }) {
  const c = normalize(command);
  if (isCommitRecoveryMission(missionSlug, mission)) {
    if (/^git (?:log|show)(?:\s|$)/.test(c)) session.recoveryHistoryInspected = true;
    if (/^(?:git restore(?:\s|$)|git checkout\s+[^\s]+\s+--\s+|git show\s+[^\s:]+:[^\s]+\s*>)/.test(c)) session.recoveryPerformed = true;
    if (/^git status(?:\s|$)/.test(c) && session.recoveryPerformed) session.recoveryFinalVerified = true;
  }
  if (missionSlug === "branching" && /^cd (?:\/workspace\/)?branch-lab\/?$/.test(c)) session.cwd = "/workspace/branch-lab";
  if (missionSlug === "branching" && /^git log(?:\s|$)/.test(c)) session.verifiedHistory = true;
  if (missionSlug === "remote-workflow" && /^cd (?:\/workspace\/)?remote-lab\/?$/.test(c)) session.cwd = "/workspace/remote-lab";
  if (missionSlug === "remote-workflow" && /^git pull origin main$/.test(c)) session.pullCompleted = true;
  if (missionSlug === "mistake-recovery" && /^cd (?:\/workspace\/)?recovery-lab\/?$/.test(c)) session.cwd = "/workspace/recovery-lab";
  if (missionSlug === "mistake-recovery" && /^git (?:status|diff)(?:\s|$)/.test(c)) session.inspected = true;
}


export function getMissionStepCount(missionSlug, mission = null) {
  if (isCommitRecoveryMission(missionSlug, mission)) return commitRecoveryAllowed.length;
  if (missionSlug === "branching") {
    const configured = missionSteps(mission).length;
    return configured || allowed.branching.length;
  }
  return allowed[missionSlug]?.length || missionSteps(mission).length || 0;
}

export async function getMissionProgress({ sandboxId, missionSlug, session, mission = null }) {
  const state = await getMissionTerminalState({ sandboxId, missionSlug, session, mission });
  const totalSteps = getMissionStepCount(missionSlug, mission);
  const stateCompleted = Math.max(0, Math.min(totalSteps, Number(state.step) || 0));
  const persistedPercent = Math.max(0, Math.min(100, Number(session?.persistedProgressPercent || 0)));
  const persistedCompleted = totalSteps ? Math.min(totalSteps, Math.floor((persistedPercent * totalSteps + 0.0001) / 100)) : 0;
  const statePassed = Boolean(state.passed);
  const completedSteps = statePassed
    ? totalSteps
    : Math.max(stateCompleted, persistedCompleted);
  const complete = statePassed || (totalSteps > 0 && completedSteps >= totalSteps);
  return {
    completedSteps,
    totalSteps,
    progressPercent: totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0,
    complete,
    currentStep: complete ? null : completedSteps,
    label: state.label,
    detail: state.detail || ""
  };
}
