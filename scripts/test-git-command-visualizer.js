import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { STEPS, sceneFor } from "../public/git-command-visualizer-data.js";

// Compare every scene with real Git in disposable local repositories. No
// application account, Docker service, public remote, or database is touched.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitstack-flow-lab-"));
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Flow Lab Test", GIT_AUTHOR_EMAIL: "test@gitstack.local",
  GIT_COMMITTER_NAME: "Flow Lab Test", GIT_COMMITTER_EMAIL: "test@gitstack.local" };
function git(cwd, args, optional = false) {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  if (!optional) assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
  return result.status === 0 ? result.stdout.trim() : "";
}
const lines = (value) => value.split("\n").filter(Boolean).sort();
const files = (cwd) => fs.readdirSync(cwd).filter((name) => name !== ".git").sort();
const write = (cwd, name, version) => fs.writeFileSync(path.join(cwd, name), `${version}\n`);
function commit(cwd, message) { git(cwd, ["add", "-A"]); git(cwd, ["commit", "-m", message]); }
let remote;
function check(index, phase, cwd, exampleRemote = remote) {
  const expected = sceneFor(index, phase);
  const context = `${STEPS[index].name} (${phase})`;
  const repo = fs.existsSync(path.join(cwd, ".git"));
  assert.equal(repo, expected.repo, `${context}: .git existence`);
  assert.deepEqual(files(cwd), expected.files.map((file) => file.name).sort(), `${context}: files stay in working tree`);
  const remoteCount = exampleRemote ? Number(git(exampleRemote, ["rev-list", "--all", "--count"])) : 0;
  assert.equal(remoteCount, expected.remote, `${context}: actual remote history`);
  if (!repo) return;
  assert.equal(Number(git(cwd, ["rev-list", "--all", "--count"])), expected.local, `${context}: local history`);
  for (const [ref, pointer] of [["main", expected.main], ["feature/login", expected.feature], ["refs/remotes/origin/main", expected.tracking]]) {
    const count = git(cwd, ["rev-list", "--count", ref], true);
    assert.equal(count ? Number(count) - 1 : -1, pointer, `${context}: ${ref} pointer`);
  }
  assert.equal(git(cwd, ["symbolic-ref", "--short", "HEAD"]), expected.head, `${context}: HEAD branch`);
  assert.deepEqual(lines(git(cwd, ["diff", "--cached", "--name-only"])), [...expected.staged].sort(), `${context}: staged differences`);
  assert.equal(Boolean(git(cwd, ["remote", "get-url", "origin"], true)), expected.connected, `${context}: remote connection`);
  const modified = lines(git(cwd, ["diff", "--name-only"]));
  const untracked = lines(git(cwd, ["ls-files", "--others", "--exclude-standard"]));
  for (const file of expected.files) {
    assert.equal(modified.includes(file.name), Boolean(file.modified), `${context}: unstaged ${file.name}`);
    assert.equal(untracked.includes(file.name), Boolean(file.untracked), `${context}: untracked ${file.name}`);
    if (file.version) assert.equal(fs.readFileSync(path.join(cwd, file.name), "utf8").trim(), file.version, `${context}: snapshot ${file.name}`);
  }
}

try {
  const init = path.join(root, "init"); fs.mkdirSync(init); write(init, "scratch.js", "scratch");
  check(0, "before", init, null);
  git(init, STEPS[0].command.split(" ").slice(1));
  check(0, "after", init, null);

  const seed = path.join(root, "seed"); fs.mkdirSync(seed); git(seed, ["init", "-b", "main"]);
  write(seed, "README.md", "v1"); write(seed, "app.js", "v0"); commit(seed, "A: initial project");
  write(seed, "app.js", "v1"); commit(seed, "B: app foundation");
  remote = path.join(root, "origin.git"); git(root, ["clone", "--bare", seed, remote]);
  const client = path.join(root, "app"); fs.mkdirSync(client);
  check(1, "before", client);
  // Use the prepared local fixture in place of the diagram's example URL.
  git(root, ["clone", remote, client]); check(1, "after", client);

  write(client, "app.js", "v2");
  check(2, "before", client); git(client, ["status"]); check(2, "after", client);
  check(3, "before", client); git(client, ["add", "app.js"]); check(3, "after", client);
  check(4, "before", client); git(client, ["commit", "-m", "Add login"]); check(4, "after", client);
  check(5, "before", client); git(client, ["push", "origin", "main"]); check(5, "after", client);

  const teammate = path.join(root, "teammate"); git(root, ["clone", remote, teammate]);
  write(teammate, "ui.css", "v1"); commit(teammate, "D: teammate styles"); git(teammate, ["push", "origin", "main"]);
  check(6, "before", client); git(client, ["pull", "--ff-only", "origin", "main"]); check(6, "after", client);
  check(7, "before", client); git(client, ["branch", "feature/login"]); check(7, "after", client);
  check(8, "before", client); git(client, ["checkout", "feature/login"]); check(8, "after", client);

  write(client, "login.js", "v1"); commit(client, "E: login feature"); git(client, ["checkout", "main"]);
  check(9, "before", client); git(client, ["merge", "feature/login"]); check(9, "after", client);
  console.log("Git Flow Lab passed: all ten before/after scenes match real Git history, HEAD, branches, remote refs, staged changes and working file snapshots.");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
