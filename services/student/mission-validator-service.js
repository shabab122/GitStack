import path from "node:path";
import { runFixedSandboxCommand } from "./sandbox-exec.js";

async function commandOk(sandboxId, command, workdir = "/workspace") {
  const result = await runFixedSandboxCommand(sandboxId, command, { workdir });
  return { passed: result.exitCode === 0, result };
}

function check(code, label, passed, detail = "") {
  return { code, label, passed: Boolean(passed), detail };
}

function safeWorkspace(value) {
  const workspace = typeof value === "string" && value.startsWith("/workspace")
    ? path.posix.normalize(value)
    : "/workspace";
  return workspace.startsWith("/workspace") ? workspace : "/workspace";
}

function safeRelativePath(value) {
  const normalized = path.posix.normalize(String(value || "").replace(/^\/+/, ""));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) return null;
  return normalized;
}

async function validateGitBasics(sandboxId) {
  const repo = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"]);
  const file = await commandOk(sandboxId, ["test", "-f", "/workspace/profile.html"]);
  const tracked = await commandOk(sandboxId, ["git", "ls-files", "--error-unmatch", "profile.html"]);
  const commits = await runFixedSandboxCommand(sandboxId, ["git", "rev-list", "--count", "HEAD"]);
  const message = await runFixedSandboxCommand(sandboxId, ["git", "log", "-1", "--pretty=%s"]);
  const commitCount = Number.parseInt(commits.stdout.trim(), 10) || 0;
  const commitMessage = message.stdout.trim();

  return [
    check("repository_initialized", "Repository initialized", repo.passed && repo.result.stdout.trim() === "true"),
    check("profile_file_exists", "profile.html exists", file.passed),
    check("profile_file_tracked", "profile.html is staged/committed", tracked.passed),
    check("commit_created", "At least one commit exists", commitCount >= 1, `Commits: ${commitCount}`),
    check("meaningful_commit_message", "Commit message is meaningful", commitMessage.length >= 8, commitMessage || "No commit message")
  ];
}

async function validateBranching(sandboxId) {
  const workdir = "/workspace/branch-lab";
  const repo = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"], workdir);
  const branchList = await runFixedSandboxCommand(
    sandboxId,
    ["git", "for-each-ref", "--format=%(refname:short)", "refs/heads/feature/"],
    { workdir }
  );
  const featureBranches = branchList.stdout.split("\n").map((item) => item.trim()).filter(Boolean);
  const current = await runFixedSandboxCommand(sandboxId, ["git", "branch", "--show-current"], { workdir });
  const commits = await runFixedSandboxCommand(sandboxId, ["git", "rev-list", "--count", "HEAD"], { workdir });
  const commitCount = Number.parseInt(commits.stdout.trim(), 10) || 0;

  let mergedFeature = "";
  for (const branch of featureBranches) {
    const merged = await runFixedSandboxCommand(
      sandboxId,
      ["git", "merge-base", "--is-ancestor", branch, "main"],
      { workdir }
    );
    if (merged.exitCode === 0) {
      mergedFeature = branch;
      break;
    }
  }

  return [
    check("branch_repo_ready", "Branch lab repository is ready", repo.passed),
    check("feature_branch_created", "A feature/* branch exists", featureBranches.length > 0, featureBranches.join(", ") || "No feature branch"),
    check("feature_work_committed", "Feature work was committed", commitCount >= 2, `Commits on main: ${commitCount}`),
    check("feature_merged", "Feature branch was merged into main", Boolean(mergedFeature), mergedFeature || "No merged feature branch"),
    check("returned_to_main", "Current branch is main", current.stdout.trim() === "main", current.stdout.trim() || "Unknown branch")
  ];
}

async function validateRemoteWorkflow(sandboxId) {
  const workdir = "/workspace/remote-lab";
  const repo = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"], workdir);
  const origin = await runFixedSandboxCommand(sandboxId, ["git", "remote", "get-url", "origin"], { workdir });
  const commits = await runFixedSandboxCommand(sandboxId, ["git", "rev-list", "--count", "HEAD"], { workdir });
  const localHead = await runFixedSandboxCommand(sandboxId, ["git", "rev-parse", "HEAD"], { workdir });
  const remoteHead = await runFixedSandboxCommand(sandboxId, ["git", "ls-remote", "--heads", "origin", "main"], { workdir });
  const remoteHash = remoteHead.stdout.trim().split(/\s+/)[0] || "";
  const localHash = localHead.stdout.trim();
  const commitCount = Number.parseInt(commits.stdout.trim(), 10) || 0;

  return [
    check("remote_repo_cloned", "Assigned repository was cloned", repo.passed),
    check("origin_configured", "origin remote is configured", origin.exitCode === 0 && origin.stdout.includes("gitstack-origin.git"), origin.stdout.trim() || "No origin"),
    check("remote_commit_created", "A new local commit exists", commitCount >= 2, `Commits: ${commitCount}`),
    check("main_pushed", "Latest main commit was pushed to origin", Boolean(localHash && remoteHash && localHash === remoteHash), remoteHash ? `Remote: ${remoteHash.slice(0, 8)}` : "No remote main branch")
  ];
}

async function validateMistakeRecovery(sandboxId) {
  const workdir = "/workspace/recovery-lab";
  const repo = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"], workdir);
  const notes = await runFixedSandboxCommand(sandboxId, ["cat", "notes.txt"], { workdir });
  const recoveryFile = await commandOk(sandboxId, ["git", "ls-files", "--error-unmatch", "recovery-note.md"], workdir);
  const commits = await runFixedSandboxCommand(sandboxId, ["git", "rev-list", "--count", "HEAD"], { workdir });
  const status = await runFixedSandboxCommand(sandboxId, ["git", "status", "--porcelain"], { workdir });
  const commitCount = Number.parseInt(commits.stdout.trim(), 10) || 0;

  return [
    check("recovery_repo_ready", "Recovery lab repository is ready", repo.passed),
    check("accidental_change_restored", "Accidental edit was restored", notes.stdout.trim() === "This line is correct.", notes.stdout.trim()),
    check("recovery_note_committed", "recovery-note.md is committed", recoveryFile.passed),
    check("recovery_commit_created", "A recovery commit exists", commitCount >= 2, `Commits: ${commitCount}`),
    check("working_tree_clean", "Working tree is clean", status.stdout.trim() === "", status.stdout.trim() || "Clean")
  ];
}

async function validateGenericMission(sandboxId, mission) {
  const rules = mission?.validationRules && typeof mission.validationRules === "object"
    ? mission.validationRules
    : {};
  const instructions = mission?.instructions && typeof mission.instructions === "object"
    ? mission.instructions
    : {};
  const workdir = safeWorkspace(instructions.workspace);
  const checks = [];

  if (rules.repositoryInitialized) {
    const repo = await commandOk(sandboxId, ["git", "rev-parse", "--is-inside-work-tree"], workdir);
    checks.push(check("repository_initialized", "Repository initialized", repo.passed && repo.result.stdout.trim() === "true"));
  }

  const requiredFile = safeRelativePath(rules.requiredFile);
  if (requiredFile) {
    const file = await commandOk(sandboxId, ["test", "-f", path.posix.join(workdir, requiredFile)], workdir);
    checks.push(check("required_file_exists", `${requiredFile} exists`, file.passed));
    if (rules.fileMustBeTracked) {
      const tracked = await commandOk(sandboxId, ["git", "ls-files", "--error-unmatch", requiredFile], workdir);
      checks.push(check("required_file_tracked", `${requiredFile} is tracked`, tracked.passed));
    }
  }

  if (Number.isInteger(rules.minimumCommits) && rules.minimumCommits > 0) {
    const result = await runFixedSandboxCommand(sandboxId, ["git", "rev-list", "--count", "HEAD"], { workdir });
    const count = Number.parseInt(result.stdout.trim(), 10) || 0;
    checks.push(check("minimum_commits", `At least ${rules.minimumCommits} commit(s) exist`, result.exitCode === 0 && count >= rules.minimumCommits, `Commits: ${count}`));
  }

  if (Number.isInteger(rules.minimumCommitMessageLength) && rules.minimumCommitMessageLength > 0) {
    const result = await runFixedSandboxCommand(sandboxId, ["git", "log", "-1", "--pretty=%s"], { workdir });
    const message = result.stdout.trim();
    checks.push(check("commit_message_length", `Latest commit message has at least ${rules.minimumCommitMessageLength} characters`, result.exitCode === 0 && message.length >= rules.minimumCommitMessageLength, message || "No commit message"));
  }

  if (rules.requiredBranchPrefix) {
    const prefix = String(rules.requiredBranchPrefix);
    const result = await runFixedSandboxCommand(sandboxId, ["git", "for-each-ref", "--format=%(refname:short)", "refs/heads/"], { workdir });
    const branches = result.stdout.split("\n").map((item) => item.trim()).filter(Boolean);
    const matched = branches.filter((branch) => branch.startsWith(prefix));
    checks.push(check("branch_prefix", `A branch starts with ${prefix}`, matched.length > 0, matched.join(", ") || "No matching branch"));
  }

  if (rules.finishOnBranch) {
    const requiredBranch = String(rules.finishOnBranch).trim();
    const result = await runFixedSandboxCommand(sandboxId, ["git", "branch", "--show-current"], { workdir });
    const current = result.stdout.trim();

    // Recovery workflows may legitimately finish on main after the completed
    // recovery branch has been merged. Requiring the learner to switch back to
    // the recovery branch after a successful merge contradicts the final Git
    // state and made live progress (100%) disagree with submission (88%).
    const title = String(mission?.title || "").trim().toLowerCase();
    const slug = String(mission?.slug || "").trim().toLowerCase();
    const isRecoveryWorkflow =
      title.includes("recovery") ||
      slug.includes("recovery") ||
      requiredBranch.startsWith("recovery/");

    let finishBranchPassed = result.exitCode === 0 && current === requiredBranch;
    let finishDetail = current || "Unknown branch";

    if (!finishBranchPassed && isRecoveryWorkflow && current === "main" && requiredBranch) {
      const branchExists = await runFixedSandboxCommand(
        sandboxId,
        ["git", "show-ref", "--verify", "--quiet", `refs/heads/${requiredBranch}`],
        { workdir }
      );
      const mergedIntoMain = branchExists.exitCode === 0
        ? await runFixedSandboxCommand(
            sandboxId,
            ["git", "merge-base", "--is-ancestor", requiredBranch, "main"],
            { workdir }
          )
        : null;

      if (branchExists.exitCode === 0 && mergedIntoMain?.exitCode === 0) {
        finishBranchPassed = true;
        finishDetail = `${requiredBranch} completed and merged into main`;
      }
    }

    checks.push(check(
      "finish_on_branch",
      isRecoveryWorkflow
        ? `Recovery branch ${requiredBranch} is active or safely merged into main`
        : `Current branch is ${requiredBranch}`,
      finishBranchPassed,
      finishDetail
    ));
  }

  if (rules.cleanWorkingTree) {
    const result = await runFixedSandboxCommand(sandboxId, ["git", "status", "--porcelain"], { workdir });
    checks.push(check("working_tree_clean", "Working tree is clean", result.exitCode === 0 && result.stdout.trim() === "", result.stdout.trim() || "Clean"));
  }

  return checks;
}

const VALIDATORS = Object.freeze({
  "git-basics": validateGitBasics,
  branching: validateBranching,
  "remote-workflow": validateRemoteWorkflow,
  "mistake-recovery": validateMistakeRecovery
});

const BN_FEEDBACK = Object.freeze({
  repository_initialized: "Repository এখনো initialize করা হয়নি। Mission objective অনুযায়ী repository তৈরি করুন।",
  profile_file_exists: "profile.html ফাইলটি এখনো পাওয়া যায়নি।",
  profile_file_tracked: "profile.html Git tracking-এ নেই।",
  commit_created: "এখনো কোনো commit তৈরি হয়নি।",
  meaningful_commit_message: "Commit message আরও স্পষ্ট ও অর্থপূর্ণ করুন।",
  feature_branch_created: "Required feature branch তৈরি করা হয়নি।",
  feature_work_committed: "Feature কাজটি commit করা হয়নি।",
  feature_merged: "Feature branch main branch-এ merge করা হয়নি।",
  returned_to_main: "Mission submit করার আগে main branch-এ ফিরে আসুন।",
  remote_repo_cloned: "Assigned remote repository এখনো clone করা হয়নি।",
  origin_configured: "origin remote ঠিকভাবে configured নেই।",
  remote_commit_created: "Remote lab-এ নতুন change commit করা হয়নি।",
  main_pushed: "Latest commit origin/main-এ push হয়নি।",
  accidental_change_restored: "Accidental change এখনো restore করা হয়নি।",
  recovery_note_committed: "Recovery note তৈরি করে commit করুন।",
  recovery_commit_created: "Recovery কাজের জন্য নতুন commit তৈরি হয়নি।",
  required_file_exists: "Mission-এর required file এখনো পাওয়া যায়নি।",
  required_file_tracked: "Required file Git tracking-এ নেই।",
  minimum_commits: "Mission-এর required minimum commit count এখনো পূরণ হয়নি।",
  commit_message_length: "Latest commit message required quality threshold পূরণ করেনি।",
  branch_prefix: "Required naming pattern অনুযায়ী branch তৈরি করা হয়নি।",
  finish_on_branch: "Mission submit করার সময় required branch active নেই।",
  working_tree_clean: "Working tree clean নয়। Pending change শেষ করে আবার submit করুন।"
});

export async function validateMission({ sandboxId, missionSlug, mission = null }) {
  const validator = VALIDATORS[missionSlug];
  const checks = validator
    ? await validator(sandboxId)
    : await validateGenericMission(sandboxId, mission);

  if (!checks.length) {
    return {
      supported: false,
      passed: false,
      score: 0,
      checks: [],
      feedback: ["এই mission-এর automatic validation rules এখনো configure করা হয়নি।"]
    };
  }

  const passedCount = checks.filter((item) => item.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);
  const failed = checks.filter((item) => !item.passed);
  const passed = failed.length === 0;

  const feedback = passed
    ? ["অভিনন্দন! Mission-এর সব required Git step সফলভাবে সম্পন্ন হয়েছে।"]
    : failed.map((item) => BN_FEEDBACK[item.code] || `${item.label} সম্পন্ন হয়নি।`);

  return {
    supported: true,
    passed,
    score,
    checks,
    feedback
  };
}
