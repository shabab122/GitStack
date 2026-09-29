import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = mkdtempSync(path.join(os.tmpdir(), "gitstack-repository-restore-"));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const roles = ["feature/login-improvement", "test/login-improvement", "review/login-improvement"];
const previousToken = process.env.GITEA_ADMIN_TOKEN;
const previousSecret = process.env.GITEA_WEBHOOK_SECRET;
process.env.GITEA_ADMIN_TOKEN = "test-service-token";
process.env.GITEA_WEBHOOK_SECRET = "test-webhook-secret";
const { buildCollaborationWorkspaceScript, preparedStudentAssignment } = await import("../services/collaboration/collaboration-service.js");

try {
  const seed = path.join(temp, "seed");
  const bare = path.join(temp, "origin.git");
  mkdirSync(seed);
  git("init", "-b", "main", seed);
  git("-C", seed, "config", "user.name", "Test Author");
  git("-C", seed, "config", "user.email", "author@example.test");
  writeFileSync(path.join(seed, "COLLABORATION_MISSION.md"), "Team mission\n");
  git("-C", seed, "add", ".");
  git("-C", seed, "commit", "-m", "Prepare team mission");
  for (const branch of roles) git("-C", seed, "branch", branch);
  git("init", "--bare", bare);
  git("-C", seed, "remote", "add", "origin", bare);
  git("-C", seed, "push", "origin", "--all");
  git("--git-dir", bare, "symbolic-ref", "HEAD", "refs/heads/main");

  const remote = `file://${bare}`;
  for (const [index, branch] of roles.entries()) {
    const workspaceRoot = path.join(temp, `student-${index}`);
    mkdirSync(workspaceRoot);
    const script = buildCollaborationWorkspaceScript({
      serviceCloneUrl: remote, cleanRemote: remote, branch,
      identity: `student-${index}`, workspaceRoot
    });
    const prepare = () => execFileSync("bash", ["-lc", script], { encoding: "utf8", timeout: 38_000 });
    const repo = path.join(workspaceRoot, "team-repo");
    assert.match(prepare(), /workspace ready/, "Initial clone did not finish");
    assert.equal(git("-C", repo, "branch", "--show-current"), branch);
    assert.equal(git("-C", repo, "remote", "get-url", "origin"), remote);

    // Docker tmpfs is empty after a restart. Recovery must recreate the same
    // role branch without changing the persisted Gitea repository.
    rmSync(repo, { recursive: true });
    assert.match(prepare(), /workspace ready/, "Restart recovery did not finish");
    assert.equal(git("-C", repo, "branch", "--show-current"), branch);
    const workingFile = path.join(repo, "COLLABORATION_MISSION.md");
    writeFileSync(workingFile, `Team mission\nStudent ${index} work\n`);
    prepare();
    assert.match(readFileSync(workingFile, "utf8"), /Student \d work/, "Resume discarded uncommitted student work");
    git("-C", repo, "add", ".");
    git("-C", repo, "commit", "-m", `Student ${index} contribution`);
    git("-C", repo, "push", "origin", branch);
    assert.equal(git("--git-dir", bare, "rev-parse", branch), git("-C", repo, "rev-parse", "HEAD"),
      "Commands in the restored terminal did not reach the shared repository");
  }

  const blocked = path.join(temp, "blocked");
  mkdirSync(blocked);
  writeFileSync(path.join(blocked, "team-repo"), "unrelated data");
  const blockedScript = buildCollaborationWorkspaceScript({
    serviceCloneUrl: remote, cleanRemote: remote,
    branch: roles[0], identity: "student", workspaceRoot: blocked
  });
  assert.throws(() => execFileSync("bash", ["-lc", blockedScript], { encoding: "utf8", stdio: "pipe" }),
    /Command failed/, "An unrelated workspace path must not be deleted for repair");
  assert.equal(readFileSync(path.join(blocked, "team-repo"), "utf8"), "unrelated data");

  // A prepared, owned, existing session can restore a wiped clone even if an
  // unrelated Gitea metadata API is slow. Initial starts still use full checks.
  const team = {
    id: "team-1", giteaRepositoryId: 9, giteaOwner: "gitstack", giteaRepository: "team-one",
    giteaTeamId: 17, giteaWebhookId: 31,
    members: ["FEATURE_DEVELOPER", "TEST_DEVELOPER", "CODE_REVIEWER"].map((teamRole, index) => ({
      userId: `user-${index}`, teamRole, user: { id: `user-${index}`, role: "STUDENT", isActive: true, giteaUsername: `member-${index}` }
    }))
  };
  const assignment = { id: "assignment-1", collaborationPreparedAt: new Date(), giteaIssueNumber: 3,
    missionTemplate: { missionType: "TEAM" }, team };
  const prisma = {
    assignment: { findUnique: async () => assignment },
    missionRun: { findFirst: async () => ({ id: "run-1", teamRole: "CODE_REVIEWER" }) },
    sandboxSession: { findFirst: async () => ({ sandboxId: "sandbox-1", status: "RUNNING" }) }
  };
  // This local fast path requires Gitea configuration; it never bypasses
  // missing service credentials or a changed student username.
  const restored = await preparedStudentAssignment({ prisma, assignmentId: assignment.id,
    user: { id: "user-2", giteaUsername: "member-2" }, resumeExistingSession: true });
  assert.equal(restored?.team, team, "Existing assignment did not use the prepared local state");
  assert.equal(await preparedStudentAssignment({ prisma, assignmentId: assignment.id,
    user: { id: "user-2", giteaUsername: "different-user" }, resumeExistingSession: true }), null,
    "Changed Gitea identity must not reuse a prior session");
} finally {
  rmSync(temp, { recursive: true, force: true });
  if (previousToken === undefined) delete process.env.GITEA_ADMIN_TOKEN;
  else process.env.GITEA_ADMIN_TOKEN = previousToken;
  if (previousSecret === undefined) delete process.env.GITEA_WEBHOOK_SECRET;
  else process.env.GITEA_WEBHOOK_SECRET = previousSecret;
}

console.log("Collaboration restore passed: all role branches, tmpfs restart, preserved work, Git push and local prepared handoff.");
