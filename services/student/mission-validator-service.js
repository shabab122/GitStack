import { runFixedSandboxCommand } from "./sandbox-exec.js";

async function commandOk(sandboxId, command, workdir = "/workspace") {
  const result = await runFixedSandboxCommand(sandboxId, command, { workdir });
  return { passed: result.exitCode === 0, result };
}

function check(code, label, passed, detail = "") {
  return { code, label, passed: Boolean(passed), detail };
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

const VALIDATORS = Object.freeze({
  "git-basics": validateGitBasics,
  branching: validateBranching,
  "remote-workflow": validateRemoteWorkflow,
  "mistake-recovery": validateMistakeRecovery
});

const BN_FEEDBACK = Object.freeze({
  repository_initialized: "প্রথমে git init চালিয়ে repository তৈরি করুন।",
  profile_file_exists: "profile.html ফাইলটি এখনো পাওয়া যায়নি। touch profile.html দিয়ে তৈরি করুন।",
  profile_file_tracked: "profile.html Git-এর tracking-এ নেই। git add profile.html চালিয়ে commit করুন।",
  commit_created: "এখনো কোনো commit তৈরি হয়নি। git commit -m \"meaningful message\" ব্যবহার করুন।",
  meaningful_commit_message: "Commit message একটু স্পষ্ট ও অর্থপূর্ণ করুন (কমপক্ষে ৮ অক্ষর)।",
  feature_branch_created: "feature/ দিয়ে শুরু হওয়া একটি branch তৈরি করুন, যেমন feature/profile।",
  feature_work_committed: "Feature branch-এ কাজ commit করুন, তারপর main-এ ফিরে আসুন।",
  feature_merged: "Feature branch-টি main branch-এ merge করা হয়নি।",
  returned_to_main: "Mission submit করার আগে main branch-এ ফিরে আসুন।",
  remote_repo_cloned: "Assigned remote repository clone করুন: git clone /tmp/gitstack-origin.git remote-lab",
  origin_configured: "origin remote ঠিকভাবে configured নেই।",
  remote_commit_created: "Remote lab-এ নতুন change commit করুন।",
  main_pushed: "Latest commit origin/main-এ push হয়নি। git push origin main চালান।",
  accidental_change_restored: "notes.txt-এর accidental change restore করুন: git restore notes.txt",
  recovery_note_committed: "recovery-note.md তৈরি করে Git-এ add ও commit করুন।",
  recovery_commit_created: "Recovery কাজের জন্য নতুন commit তৈরি করুন।",
  working_tree_clean: "Working tree clean নয়। git status দেখে pending changes শেষ করুন।"
});

export async function validateMission({ sandboxId, missionSlug }) {
  const validator = VALIDATORS[missionSlug];
  if (!validator) {
    return {
      supported: false,
      passed: false,
      score: 0,
      checks: [],
      feedback: ["এই mission-এর automatic validator এখনো configure করা হয়নি।"]
    };
  }

  const checks = await validator(sandboxId);
  const passedCount = checks.filter((item) => item.passed).length;
  const score = checks.length ? Math.round((passedCount / checks.length) * 100) : 0;
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
