import { classifyCommand, evaluateMissionCommand } from "../services/student/mission-step-engine.js";

function assert(condition, message) { if (!condition) throw new Error(message); }
function mission(slug, steps, validationRules = {}, workspace = "/workspace") {
  return { slug, instructions: { workspace, steps }, validationRules };
}
function expect(m, stepIndex, command, decision = "execute-and-validate") {
  const r = evaluateMissionCommand({ mission: m, command, completedSteps: stepIndex });
  assert(r.decision === decision,
    `${m.slug} step ${stepIndex + 1}: ${command} -> ${r.decision}/${r.code}; expected ${decision}`);
  return r;
}

// Built-in: Git Basics.
const gitBasics = mission("git-basics", [
  "Run git init",
  "Create profile.html",
  "Stage profile.html with git add",
  "Commit it with a meaningful message",
  "Use git status and git log to review your work"
], { repositoryInitialized: true, requiredFile: "profile.html", fileMustBeTracked: true, minimumCommits: 1 });
expect(gitBasics, 0, "git init");
expect(gitBasics, 1, "touch profile.html");
expect(gitBasics, 2, "git add profile.html");
expect(gitBasics, 3, 'git commit -m "Add profile"');
expect(gitBasics, 4, "git status");
expect(gitBasics, 4, "git log --oneline");

// Published instructor mission visible in the supplied screenshots.
const feature = mission("feature-branch-development", [
  "Initialize a new Git repository",
  "Create the required project documentation file",
  "Create and switch to a feature branch",
  "Add and commit feature changes with meaningful messages",
  "Merge the completed feature into the main branch",
  "Verify the final repository history"
], {
  repositoryInitialized: true,
  requiredFile: "README.md",
  fileMustBeTracked: true,
  minimumCommits: 2,
  requiredBranchPrefix: "feature/",
  finishOnBranch: "main"
});
expect(feature, 0, "git init");
expect(feature, 1, "touch README.md");
expect(feature, 2, "git switch -c feature/docs");
expect(feature, 3, "git add README.md");
expect(feature, 3, 'git commit -m "Document feature"');
expect(feature, 4, "git merge feature/docs");
expect(feature, 5, "git log --oneline --graph --all");

// Built-in Branching & Merge, including the previously failing navigation step.
const branching = mission("branching", [
  "Enter the prepared branch-lab repository",
  "Create a branch whose name starts with feature/",
  "Create profile.html and commit it on the feature branch",
  "Switch back to main",
  "Merge the feature branch into main",
  "Verify the final repository history"
], { requiredBranchPrefix: "feature/" }, "/workspace/branch-lab");
expect(branching, 0, "cd branch-lab");
expect(branching, 0, "cd prepared", "block");
expect(branching, 1, "git checkout -b feature/login");
expect(branching, 2, "touch profile.html");
expect(branching, 2, "git add profile.html");
expect(branching, 2, 'git commit -m "Add profile"');
expect(branching, 3, "git switch main");
expect(branching, 4, "git merge feature/login");
expect(branching, 5, "git show --stat");

// Published collaborative-style individual mission visible in screenshots.
const collaborative = mission("collaborative-feature-development", [
  "Initialize the project repository and prepare it for development work",
  "Create a separate development workflow for the assigned feature",
  "Implement the required project changes",
  "Track and review your modifications before saving your progress",
  "Create meaningful commits that explain your completed work",
  "Prepare your changes for team review and integration"
], {
  repositoryInitialized: true,
  requiredFile: "feature.txt",
  requiredBranchPrefix: "feature/",
  minimumCommits: 1,
  cleanWorkingTree: true
});
expect(collaborative, 0, "git init");
expect(collaborative, 1, "git switch -c feature/project");
expect(collaborative, 2, "touch feature.txt");
expect(collaborative, 3, "git status");
expect(collaborative, 3, "git diff");
expect(collaborative, 3, "git add feature.txt");
expect(collaborative, 4, 'git commit -m "Implement feature"');
expect(collaborative, 5, "git status");

// Commit Recovery Challenge visible in screenshots.
const commitRecovery = mission("commit-recovery-challenge", [
  "Initialize the repository and create the required project file",
  "Create an initial commit containing the working project state",
  "Make and commit a second change to the project",
  "Inspect the commit history and identify the previous working state",
  "Safely recover the required file without deleting the existing commit history",
  "Create a recovery commit with a meaningful message",
  "Verify that the working tree is clean and the recovered project is correct"
], { repositoryInitialized: true, requiredFile: "project.md", minimumCommits: 3, cleanWorkingTree: true });
expect(commitRecovery, 0, "git init");
expect(commitRecovery, 0, "touch project.md");
expect(commitRecovery, 1, "git add project.md");
expect(commitRecovery, 1, 'git commit -m "Initial state"');
expect(commitRecovery, 2, "echo update >> project.md");
expect(commitRecovery, 2, "git add project.md");
expect(commitRecovery, 2, 'git commit -m "Second state"');
expect(commitRecovery, 3, "git log --oneline");
expect(commitRecovery, 4, "git restore --source=HEAD~1 -- project.md");
expect(commitRecovery, 5, "git add project.md");
expect(commitRecovery, 5, 'git commit -m "Recover project"');
expect(commitRecovery, 6, "git status");

// Built-in remote workflow.
const remote = mission("remote-workflow", [
  "Clone the prepared local remote repository into remote-lab",
  "Create update.txt",
  "Stage and commit the file",
  "Run git pull origin main",
  "Push your latest main branch to origin"
], {}, "/workspace/remote-lab");
expect(remote, 0, "git clone /tmp/gitstack-origin.git remote-lab");
expect(remote, 1, "touch update.txt");
expect(remote, 2, "git add update.txt");
expect(remote, 2, 'git commit -m "Update"');
expect(remote, 3, "git pull origin main");
expect(remote, 4, "git push origin main");

// Built-in mistake recovery.
const recovery = mission("mistake-recovery", [
  "Enter recovery-lab and inspect git status / git diff",
  "Restore notes.txt to its committed version",
  "Create recovery-note.md describing what you learned",
  "Stage and commit recovery-note.md",
  "Finish with a clean working tree"
], {}, "/workspace/recovery-lab");
expect(recovery, 0, "cd recovery-lab");
expect(recovery, 0, "git status");
expect(recovery, 0, "git diff");
expect(recovery, 1, "git restore notes.txt");
expect(recovery, 2, "touch recovery-note.md");
expect(recovery, 3, "git add recovery-note.md");
expect(recovery, 3, 'git commit -m "Recovery note"');
expect(recovery, 4, "git status");

// Future instructor mission: common Git cheat-sheet vocabulary.
const future = mission("future-advanced", [
  "Fetch updates from origin",
  "Rebase the feature branch onto main",
  "Temporarily stash the local changes",
  "Create a release tag",
  "Configure a backup remote",
  "Cherry-pick the required commit",
  "Revert the faulty commit",
  "Delete the obsolete branch",
  "Inspect the reference history"
]);
expect(future, 0, "git fetch origin");
expect(future, 1, "git rebase main");
expect(future, 2, "git stash");
expect(future, 3, "git tag v1.0");
expect(future, 4, "git remote add backup /tmp/backup.git");
expect(future, 5, "git cherry-pick abc123");
expect(future, 6, "git revert abc123");
expect(future, 7, "git branch -d old-feature");
expect(future, 8, "git reflog");

// Valid Git but wrong current step remains blocked; harmless inspection does not.
expect(future, 0, 'git commit -m "wrong step"', "block");
expect(future, 0, "git status", "execute-no-progress");
expect(future, 0, "git definitely-not-a-command", "execute-native-error");

// Catalog coverage sanity checks.
for (const command of [
  "git branch -av", "git remote -v", "git config --list", "git stash",
  "git tag v2", "git worktree list", "git grep TODO", "git blame README.md",
  "git reset --hard HEAD", "git clean -fd", "git submodule status",
  "git shortlog", "git describe --tags", "git reflog"
]) {
  const info = classifyCommand(command);
  assert(!info.unknown, `catalog failed to recognize: ${command}`);
}

console.log("v27 universal mission command engine regression test passed.");
