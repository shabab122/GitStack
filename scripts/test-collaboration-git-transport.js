import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import net from "node:net";
import jwt from "jsonwebtoken";

import { ensureCollaborationNetworkPeer } from "../services/sandbox/network-service.js";

const execute = promisify(execFile);
const temp = mkdtempSync(path.join(os.tmpdir(), "gitstack-git-http-"));
const fixtureEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
const git = async (...args) => (await execute("git", args, { env: fixtureEnv, encoding: "utf8", timeout: 35_000 })).stdout.trim();
const branches = ["feature/login-improvement", "test/login-improvement", "review/login-improvement"];
const serviceSecret = "disposable-service-secret";
const basic = (user, password) => "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
const accepted = new Set([basic("service", serviceSecret), ...branches.map((_, i) => basic(`member-${i}`, `student-token-${i}`))]);
const requests = [];
const projectRoot = path.join(temp, "http");
const seed = path.join(temp, "seed");
const bare = path.join(projectRoot, "gitstack", "team.git");
const oldPath = process.env.PATH;
const oldState = process.env.GITSTACK_TRANSPORT_DOCKER_STATE;
const envNames = ["GITEA_ADMIN_TOKEN", "GITEA_BASE_URL", "GITEA_INTERNAL_BASE_URL", "GITEA_WEBHOOK_SECRET", "GITEA_DOCKER_CONTAINER"];
const previousEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
let server;
let closeRelays;
let blockedServer;
const isolatedRelays = [];
let terminalServer;
let terminalManager;
let terminalClient;
let detachTerminal;

try {
  mkdirSync(path.dirname(bare), { recursive: true });
  mkdirSync(path.join(seed, "src"), { recursive: true });
  mkdirSync(path.join(seed, "tests"));
  await git("init", "-b", "main", seed);
  await git("-C", seed, "config", "user.name", "Fixture author");
  await git("-C", seed, "config", "user.email", "author@example.test");
  writeFileSync(path.join(seed, "src/login-policy.txt"), "AUTH_MODE=basic\nFEATURE_FLAG=off\n");
  writeFileSync(path.join(seed, "tests/test-evidence.md"), "No test evidence yet.\n");
  await git("-C", seed, "add", ".");
  await git("-C", seed, "commit", "-m", "Prepare collaboration fixture");
  for (const branch of branches) await git("-C", seed, "branch", branch);
  await git("init", "--bare", bare);
  await git("--git-dir", bare, "config", "http.receivepack", "true");
  await git("-C", seed, "remote", "add", "origin", bare);
  await git("-C", seed, "push", "origin", "--all");
  await git("--git-dir", bare, "symbolic-ref", "HEAD", "refs/heads/main");

  // A real Git smart-HTTP server, with separate service/student credentials.
  // It uses an ephemeral port and disposable repositories, never user Gitea.
  server = createServer(async (req, res) => {
    if (req.url === "/api/v1/user") {
      if (req.headers.authorization !== `token ${serviceSecret}`) { res.writeHead(401); res.end(); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ login: "service" }));
      return;
    }
    const auth = req.headers.authorization || "";
    if (!accepted.has(auth)) {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="GitStack fixture"' });
      res.end("Authentication required");
      return;
    }
    const user = Buffer.from(auth.slice(6), "base64").toString().split(":")[0];
    requests.push({ user, method: req.method, url: req.url });
    const url = new URL(req.url, "http://fixture.local");
    const body = [];
    for await (const chunk of req) body.push(chunk);
    const child = spawn("git", ["http-backend"], { env: {
      ...fixtureEnv, GIT_PROJECT_ROOT: projectRoot, GIT_HTTP_EXPORT_ALL: "1",
      PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), REQUEST_METHOD: req.method,
      CONTENT_TYPE: req.headers["content-type"] || "", CONTENT_LENGTH: String(Buffer.concat(body).length),
      REMOTE_USER: user, HTTP_GIT_PROTOCOL: req.headers["git-protocol"] || ""
    } });
    const output = [];
    child.stdout.on("data", chunk => output.push(chunk));
    child.stderr.resume();
    child.on("error", () => { if (!res.headersSent) res.writeHead(500); res.end(); });
    child.on("close", () => {
      if (res.writableEnded) return;
      const bytes = Buffer.concat(output);
      const split = bytes.indexOf("\r\n\r\n");
      if (split < 0) { res.writeHead(500); res.end(); return; }
      let status = 200;
      const headers = {};
      for (const line of bytes.subarray(0, split).toString().split("\r\n")) {
        const colon = line.indexOf(":");
        const key = line.slice(0, colon).toLowerCase();
        const value = line.slice(colon + 1).trim();
        if (key === "status") status = Number(value.split(" ")[0]);
        else if (colon > 0) headers[key] = value;
      }
      res.writeHead(status, headers);
      res.end(bytes.subarray(split + 4));
    });
    child.stdin.end(Buffer.concat(body));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://gitea-unresolvable.invalid:${port}`;
  process.env.GITEA_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.GITEA_INTERNAL_BASE_URL = baseUrl;
  process.env.GITEA_ADMIN_TOKEN = serviceSecret;
  process.env.GITEA_WEBHOOK_SECRET = "disposable-webhook-secret";
  process.env.GITEA_DOCKER_CONTAINER = "gitstack-gitea";
  const { buildCollaborationGitTransport, buildCollaborationWorkspaceScript, startCollaborationWorkspace } =
    await import("../services/collaboration/collaboration-service.js");
  const { openCollaborationGitRelay, closeAllCollaborationGitRelays, reconnectCollaborationGitRelay } =
    await import("../services/collaboration/git-relay-service.js");
  closeRelays = closeAllCollaborationGitRelays;
  const remote = `${baseUrl}/gitstack/team.git`;
  const serviceUrl = new URL(remote);
  serviceUrl.username = "service";
  serviceUrl.password = serviceSecret;
  const transport = buildCollaborationGitTransport({ baseUrl, ipAddress: "127.0.0.1" });
  assert.equal(transport.resolve, `gitea-unresolvable.invalid:${port}:127.0.0.1`);
  assert.equal(buildCollaborationGitTransport({ baseUrl, ipAddress: "not-an-address" }), null);

  // Reproduce the previous DNS failure, then prove the inspected address fixes it.
  await assert.rejects(() => execute("git", ["-c", "http.proxy=", "ls-remote", remote], {
    env: fixtureEnv, encoding: "utf8", timeout: 5000
  }), /resolve host/);
  const roots = branches.map((_, i) => path.join(temp, `student-${i}`));
  const repos = roots.map(root => path.join(root, "team-repo"));
  const prepare = async (i, password = serviceSecret) => {
    const url = new URL(serviceUrl);
    url.password = password;
    const script = buildCollaborationWorkspaceScript({ serviceCloneUrl: url.toString(), cleanRemote: remote,
      branch: branches[i], identity: `member-${i}`, workspaceRoot: roots[i], transport });
    return execute("bash", ["-lc", script], { env: fixtureEnv, encoding: "utf8", timeout: 35_000 });
  };
  const studentGit = async (i, ...args) => git("-C", repos[i], "-c", "credential.helper=", "-c", "http.extraHeader=",
    "-c", `http.${remote}.extraHeader=Authorization: ${basic(`member-${i}`, `student-token-${i}`)}`, ...args);
  const assertClean = i => {
    const config = readFileSync(path.join(repos[i], ".git/config"), "utf8");
    assert.ok(!config.includes(serviceSecret) && !config.includes(basic("service", serviceSecret)), "Service credentials persisted in the student clone");
    assert.doesNotMatch(config, /Authorization|extraheader/i);
    assert.equal(readdirSync(roots[i]).some(name => name.startsWith(".team-repo-preparing.")), false);
  };
  const commit = async (i, message) => { await git("-C", repos[i], "add", "."); await git("-C", repos[i], "commit", "-m", message); };
  for (let i = 0; i < branches.length; i += 1) {
    mkdirSync(roots[i]);
    assert.match((await prepare(i)).stdout, /workspace ready/);
    assert.equal(await git("-C", repos[i], "branch", "--show-current"), branches[i]);
    assert.equal(await git("-C", repos[i], "remote", "get-url", "origin"), remote);
    assertClean(i);
  }

  writeFileSync(path.join(repos[0], "src/login-policy.txt"), "AUTH_MODE=secure-feature\nFEATURE_FLAG=off\n");
  await commit(0, "Improve login authentication");
  writeFileSync(path.join(repos[0], "src/login-policy.txt"), "AUTH_MODE=secure-feature\nFEATURE_FLAG=on\n");
  await commit(0, "Enable improved login feature");
  await studentGit(0, "push", "origin", branches[0]);
  writeFileSync(path.join(repos[1], "src/login-policy.txt"), "AUTH_MODE=secure-test\nFEATURE_FLAG=off\n");
  writeFileSync(path.join(repos[1], "tests/test-evidence.md"), "FAIL: FEATURE_FLAG=off\n");
  await commit(1, "Record failing login test");
  await studentGit(1, "push", "origin", branches[1]);
  writeFileSync(path.join(repos[2], "REVIEW.md"), "Verify login behavior and ordered feature/test merges.\n");
  await commit(2, "Record focused login review");
  await studentGit(2, "push", "origin", branches[2]);
  for (let i = 0; i < branches.length; i += 1) {
    assert.equal(await git("--git-dir", bare, "rev-parse", branches[i]), await git("-C", repos[i], "rev-parse", "HEAD"));
    assertClean(i);
    assert.ok(requests.some(req => req.user === `member-${i}` && req.url.includes("git-receive-pack")), "Push used the service account instead of the member");
  }

  // Represent the first approved PR merge in the disposable repository.
  // The student shell never pushes directly to main.
  await git("--git-dir", bare, "update-ref", "refs/heads/main", await git("--git-dir", bare, "rev-parse", branches[0]));
  await studentGit(1, "fetch", "origin");
  await assert.rejects(() => git("-C", repos[1], "merge", "origin/main"), /Command failed/);
  assert.match(readFileSync(path.join(repos[1], "src/login-policy.txt"), "utf8"), /<<<<<<< HEAD/);
  writeFileSync(path.join(repos[1], "src/login-policy.txt"), "AUTH_MODE=secure-verified\nFEATURE_FLAG=on\n");
  writeFileSync(path.join(repos[1], "tests/test-evidence.md"), "FAIL: FEATURE_FLAG=off\nPASS: FEATURE_FLAG=on\n");
  await commit(1, "Resolve login conflict and record passing test");
  await studentGit(1, "push", "origin", branches[1]);
  await git("--git-dir", bare, "update-ref", "refs/heads/main", await git("--git-dir", bare, "rev-parse", branches[1]));
  await studentGit(2, "fetch", "origin");
  assert.match(await git("-C", repos[2], "show", "origin/main:src/login-policy.txt"), /secure-verified/);
  assert.match(await git("-C", repos[2], "show", "origin/main:tests/test-evidence.md"), /PASS/);

  // Docker tmpfs loss and failed fetches must preserve the remote/student work.
  const pushed = await git("-C", repos[1], "rev-parse", "HEAD");
  rmSync(repos[1], { recursive: true });
  await prepare(1);
  assert.equal(await git("-C", repos[1], "rev-parse", "HEAD"), pushed);
  const draft = path.join(repos[1], "student-draft.txt");
  writeFileSync(draft, "Unpushed contribution\n");
  await assert.rejects(() => prepare(1, "wrong-disposable-secret"), error => {
    assert.match(error.stderr, /Gitea rejected repository access/);
    assert.ok(!error.stderr.includes(serviceSecret) && !error.stderr.includes("wrong-disposable-secret"));
    return true;
  });
  assert.equal(readFileSync(draft, "utf8"), "Unpushed contribution\n");
  assertClean(1);
  await prepare(1);
  assert.equal(readFileSync(draft, "utf8"), "Unpushed contribution\n");

  const failedRoot = path.join(temp, "bad-auth");
  mkdirSync(failedRoot);
  const wrongUrl = new URL(serviceUrl);
  wrongUrl.password = "wrong-disposable-secret";
  const beforeLogs = readdirSync(os.tmpdir()).filter(name => name.startsWith("gitstack-team-git."));
  await assert.rejects(() => execute("bash", ["-lc", buildCollaborationWorkspaceScript({
    serviceCloneUrl: wrongUrl.toString(), cleanRemote: remote, branch: branches[0], identity: "student", workspaceRoot: failedRoot, transport
  })], { env: fixtureEnv, encoding: "utf8", timeout: 35_000 }), /Gitea rejected repository access/);
  assert.equal(existsSync(path.join(failedRoot, "team-repo")), false);
  assert.equal(readdirSync(failedRoot).length, 0, "Failed clone left a partial repository");
  assert.deepEqual(readdirSync(os.tmpdir()).filter(name => name.startsWith("gitstack-team-git.")), beforeLogs,
    "Repository preparation left a student-readable Git log");

  // Reproduce the reported failure: the app-side Git server is healthy but the
  // sandbox's direct endpoint accepts a connection and never answers.
  let blockedRequests = 0;
  blockedServer = createServer(() => { blockedRequests += 1; });
  await new Promise(resolve => blockedServer.listen(0, "127.0.0.1", resolve));
  const blockedBase = `http://127.0.0.1:${blockedServer.address().port}`;
  const blockedRemote = `${blockedBase}/gitstack/team.git`;
  await assert.rejects(() => execute("git", ["-c", "http.proxy=", "ls-remote", blockedRemote], {
    env: { ...fixtureEnv, NO_PROXY: "*", no_proxy: "*" }, encoding: "utf8", timeout: 1200
  }), error => error.killed === true);
  assert.equal(blockedRequests, 1);
  const relayRepos = [];
  for (let i = 0; i < branches.length; i += 1) {
    const relay = await openCollaborationGitRelay({
      containerName: `isolated-student-${i}`, baseUrl: `http://127.0.0.1:${port}`, internalBaseUrl: blockedBase,
      spawnRelay: source => spawn("perl", ["-e", source], { stdio: ["pipe", "pipe", "pipe"] })
    });
    isolatedRelays.push(relay);
    const root = path.join(temp, `blocked-student-${i}`);
    mkdirSync(root);
    relayRepos.push(path.join(root, "team-repo"));
    const url = new URL(blockedRemote);
    url.username = "service"; url.password = serviceSecret;
    const ready = await execute("bash", ["-lc", buildCollaborationWorkspaceScript({
      serviceCloneUrl: url.toString(), cleanRemote: blockedRemote, branch: branches[i], identity: `member-${i}`,
      workspaceRoot: root, transport: relay
    })], { env: { ...fixtureEnv, NO_PROXY: "*", no_proxy: "*" }, encoding: "utf8", timeout: 10_000 });
    assert.match(ready.stdout, /workspace ready/);
    // A real Git credential prompt helper supplies ONLY this member's token.
    const askpass = path.join(root, "askpass");
    writeFileSync(askpass, `#!/bin/sh\ncase "$1" in *Username*) printf '%s\\n' 'member-${i}' ;; *) printf '%s\\n' 'student-token-${i}' ;; esac\n`);
    chmodSync(askpass, 0o700);
    writeFileSync(path.join(relayRepos[i], `member-${i}-contribution.txt`), `Member ${i} contribution\n`);
    if (i === 0) writeFileSync(path.join(relayRepos[i], "streaming-pack.bin"), randomBytes(2 * 1024 * 1024));
    await git("-C", relayRepos[i], "add", ".");
    await git("-C", relayRepos[i], "commit", "-m", `Commit member ${i} contribution through relay`);
    await execute("git", ["-C", relayRepos[i], "-c", "credential.helper=", "push", "origin", branches[i]], {
      env: { ...fixtureEnv, GIT_ASKPASS: askpass, NO_PROXY: "", no_proxy: "" }, encoding: "utf8", timeout: 15_000
    });
    assert.equal(await git("--git-dir", bare, "rev-parse", branches[i]), await git("-C", relayRepos[i], "rev-parse", "HEAD"));
    const config = readFileSync(path.join(relayRepos[i], ".git/config"), "utf8");
    assert.ok(!config.includes(serviceSecret) && !config.includes(`student-token-${i}`));
    assert.doesNotMatch(config, /Authorization|extraheader/i);
    assert.equal(await git("-C", relayRepos[i], "config", `http.http://127.0.0.1:${port}/.proxy`), relay.proxyUrl,
      "The copied public Gitea URL bypasses the sandbox relay");
    assert.equal(await git("-C", relayRepos[i], "remote", "get-url", "origin"), blockedRemote);
  }
  assert.equal(blockedRequests, 1, "Relay clone/push still depended on the stalled sandbox endpoint");
  for (const relay of isolatedRelays) relay.close();
  await assert.rejects(() => openCollaborationGitRelay({
    containerName: "failed-relay-fixture", baseUrl: `http://127.0.0.1:${port}`, internalBaseUrl: blockedBase,
    spawnRelay: () => spawn(process.execPath, ["-e", "process.stderr.write('Docker exec failed: http://service:diagnostic-secret@fixture.test/repo'); process.exit(1)"], {
      stdio: ["pipe", "pipe", "pipe"]
    })
  }), error => {
    assert.equal(error.code, "COLLABORATION_GIT_RELAY_FAILED");
    assert.match(error.message, /Docker exec failed/);
    assert.ok(!error.message.includes("diagnostic-secret"));
    return true;
  });

  // Exercise Docker inspection/connection without a live Docker installation.
  const dockerDir = path.join(temp, "docker-fixture");
  mkdirSync(dockerDir);
  const statePath = path.join(dockerDir, "state.json");
  const state = { peers: { "gitstack-gitea": { connected: false, ip: "172.30.0.9" }, "student-container": { connected: false, ip: "172.30.0.10" } }, connections: [] };
  writeFileSync(statePath, JSON.stringify(state));
  const dockerPath = path.join(dockerDir, "docker");
  writeFileSync(dockerPath, `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);const file=process.env.GITSTACK_TRANSPORT_DOCKER_STATE;
const state=JSON.parse(fs.readFileSync(file));
if(args[0]==='network'&&args[1]==='inspect')process.stdout.write('[]');
else if(args[0]==='inspect'){
 const name=Object.keys(state.peers).find(name=>name===args[1]||state.peers[name].id===args[1]);
 const peer=state.peers[name];if(!peer){process.stderr.write('No such container');process.exit(1);}
 process.stdout.write(JSON.stringify([{Id:peer.id||name,Name:'/'+name,Config:{Labels:peer.labels||{},User:'10001:10001',WorkingDir:'/workspace'},State:{Running:true,Status:'running'},HostConfig:{NetworkMode:state.network},NetworkSettings:{Networks:peer.connected?{[state.network]:{IPAddress:peer.ip}}:{}}}]));
}else if(args[0]==='network'&&args[1]==='connect'){
 const name=args.at(-1);state.network=args.at(-2);state.peers[name].connected=true;state.connections.push(name);fs.writeFileSync(file,JSON.stringify(state));
}else if(args[0]==='ps'){
 const filter=args.find(value=>value.startsWith('label=gitstack.sandbox-id='));const id=filter?.split('=').at(-1);
 const peer=Object.values(state.peers).find(peer=>peer.labels?.['gitstack.sandbox-id']===id);if(peer)process.stdout.write(peer.id+'\\n');
}else if(args[0]==='exec'){
 const at=args.findIndex(value=>state.peers[value]);const peer=state.peers[args[at]];
 const command=args.slice(at+1).map(value=>value.replaceAll('/workspace',peer.root));
 if(command[0]==='perl'||command[0]==='script'){
  const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
  for(let i=0;i<at;i++)if(args[i]==='--env'){
   const value=args[++i];const equal=value.indexOf('=');env[value.slice(0,equal)]=value.slice(equal+1);
  }
  const child=require('node:child_process').spawn(command[0],command.slice(1),{env,stdio:'inherit'});
  process.on('SIGTERM',()=>child.kill('SIGTERM'));
  child.on('exit',code=>process.exit(code??0));
 }else{
  const result=require('node:child_process').spawnSync(command[0],command.slice(1),{env:process.env,encoding:'utf8'});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exitCode=result.status??1;
 }
}else {process.stderr.write('Unexpected Docker fixture operation');process.exit(1);}
`);
  chmodSync(dockerPath, 0o755);
  process.env.PATH = `${dockerDir}${path.delimiter}${oldPath}`;
  process.env.GITSTACK_TRANSPORT_DOCKER_STATE = statePath;
  const peer = await ensureCollaborationNetworkPeer({ containerReference: "gitstack-gitea" });
  assert.equal(peer.ipAddress, "172.30.0.9");
  assert.equal(peer.changed, true);
  const student = await ensureCollaborationNetworkPeer({ containerReference: "student-container" });
  assert.equal(student.ipAddress, "172.30.0.10");
  const current = JSON.parse(readFileSync(statePath, "utf8"));
  current.peers["gitstack-gitea"].ip = "172.30.0.19";
  writeFileSync(statePath, JSON.stringify(current));
  assert.equal((await ensureCollaborationNetworkPeer({ containerReference: "gitstack-gitea" })).ipAddress, "172.30.0.19",
    "A restarted Gitea peer reused its old address");
  assert.deepEqual(JSON.parse(readFileSync(statePath, "utf8")).connections, ["gitstack-gitea", "student-container"]);

  // Drive the production start/restore service through Docker metadata and
  // real authenticated Git HTTP. Only the Docker/Prisma adapters are fixtures.
  const roleNames = ["FEATURE_DEVELOPER", "TEST_DEVELOPER", "CODE_REVIEWER"];
  const users = roleNames.map((_, i) => ({ id: `student-${i}`, giteaUsername: `member-${i}`, role: "STUDENT", isActive: true }));
  const mission = { id: "team-mission", slug: "team-collaboration", title: "Collaboration", missionType: "TEAM" };
  const runs = users.map((user, i) => ({ id: `run-${i}`, userId: user.id, teamRole: roleNames[i],
    status: "IN_PROGRESS", progressPercent: 47, startedAt: new Date(), expiresAt: new Date(Date.now() + 120_000) }));
  const team = { id: "team-one", giteaRepositoryId: 9, giteaOwner: "gitstack", giteaRepository: "team",
    giteaRepositoryUrl: `http://127.0.0.1:${port}/gitstack/team`, giteaTeamId: 17, giteaWebhookId: 31,
    members: users.map((user, i) => ({ userId: user.id, teamRole: roleNames[i], user })) };
  const assignment = { id: "assignment-one", collaborationPreparedAt: new Date(), giteaIssueNumber: 1,
    missionTemplate: mission, team };
  const sessions = users.map((user, i) => ({ id: `session-${i}`, sandboxId: randomUUID(), userId: user.id,
    missionRunId: runs[i].id, missionRun: { ...runs[i], missionTemplate: mission }, mode: "COLLABORATION",
    status: "RUNNING", expiresAt: new Date(Date.now() + 120_000) }));
  const pipelineRoots = users.map((_, i) => path.join(temp, `pipeline-${i}`));
  const pipelineState = JSON.parse(readFileSync(statePath, "utf8"));
  pipelineState.peers["gitstack-gitea"].ip = "127.0.0.1";
  for (let i = 0; i < users.length; i += 1) {
    mkdirSync(pipelineRoots[i]);
    const name = `gitstack-sandbox-${sessions[i].sandboxId}`;
    pipelineState.peers[name] = { connected: false, ip: `172.30.0.${30 + i}`, id: `docker-${i}`, root: pipelineRoots[i],
      labels: { "gitstack.managed": "true", "gitstack.sandbox-id": sessions[i].sandboxId,
        "gitstack.owner-user-id": users[i].id, "gitstack.mission-run-id": runs[i].id, "gitstack.mode": "COLLABORATION" } };
  }
  writeFileSync(statePath, JSON.stringify(pipelineState));
  const prisma = {
    user: { findUnique: async ({ where }) => users.find(user => user.id === where.id) },
    assignment: { findUnique: async () => assignment },
    teamMember: { findFirst: async ({ where }) => team.members.find(member => member.userId === where.userId) },
    missionRun: {
      findFirst: async ({ where }) => runs.find(run => run.userId === where.userId),
      update: async ({ where, data }) => Object.assign(runs.find(run => run.id === where.id), data)
    },
    sandboxSession: {
      findFirst: async ({ where }) => sessions.find(session => session.userId === where.userId && session.missionRunId === where.missionRunId),
      findUnique: async ({ where }) => sessions.find(session => session.sandboxId === where.sandboxId),
      update: async ({ where, data }) => Object.assign(sessions.find(session => session.sandboxId === where.sandboxId), data),
      updateMany: async ({ where, data }) => {
        const session = sessions.find(session => session.sandboxId === where.sandboxId);
        if (session) Object.assign(session, data);
        return { count: session ? 1 : 0 };
      }
    }
  };
  const start = i => startCollaborationWorkspace({ prisma, terminalManager: { close() {} }, assignmentId: assignment.id, user: users[i] });
  for (let i = 0; i < users.length; i += 1) {
    const ready = await start(i);
    assert.equal(ready.sandbox.sandboxId, sessions[i].sandboxId);
    assert.equal(ready.branch, branches[i]);
    assert.equal(runs[i].progressPercent, 47, "Restore overwrote existing team progress");
    assert.equal(await git("-C", path.join(pipelineRoots[i], "team-repo"), "branch", "--show-current"), branches[i]);
  }
  rmSync(path.join(pipelineRoots[0], "team-repo"), { recursive: true });
  const [first, second] = await Promise.all([start(0), start(0)]);
  assert.equal(first.sandbox.sandboxId, second.sandbox.sandboxId, "Concurrent restore created duplicate sandboxes");
  assert.equal(await git("-C", path.join(pipelineRoots[0], "team-repo"), "rev-parse", "HEAD"), await git("--git-dir", bare, "rev-parse", branches[0]));
  // A Node app restart must refresh an already healthy clone's relay without
  // discarding unpushed files or forcing the student to delete the sandbox.
  const pipelineRepo = path.join(pipelineRoots[1], "team-repo");
  const draftPath = path.join(pipelineRepo, "unpushed-after-restart.txt");
  writeFileSync(draftPath, "Keep this local contribution\n");
  const pipelineSandbox = { mode: "COLLABORATION", containerName: `gitstack-sandbox-${sessions[1].sandboxId}` };
  const previousProxy = await git("-C", pipelineRepo, "config", `http.${baseUrl}/.proxy`);
  await closeAllCollaborationGitRelays();
  await reconnectCollaborationGitRelay(pipelineSandbox);
  assert.notEqual(await git("-C", pipelineRepo, "config", `http.${baseUrl}/.proxy`), previousProxy);
  await execute("git", ["-C", pipelineRepo, "-c", `http.${remote}.extraHeader=Authorization: ${basic("member-1", "student-token-1")}`, "fetch", "origin"], {
    env: { ...fixtureEnv, NO_PROXY: "", no_proxy: "" }, encoding: "utf8", timeout: 15_000
  });
  assert.equal(readFileSync(draftPath, "utf8"), "Keep this local contribution\n");

  // Exercise the actual authorized gateway and terminal manager, not a mock
  // Connected badge. The PTY runs real Git and asks for this student's token.
  const { attachSandboxTerminalGateway } = await import("../services/sandbox/terminal-gateway.js");
  const { createTerminalManager } = await import("../services/sandbox/terminal-manager.js");
  terminalManager = createTerminalManager({ warn() {}, error() {} });
  terminalServer = createServer((req, res) => { res.writeHead(404); res.end(); });
  await new Promise(resolve => terminalServer.listen(0, "127.0.0.1", resolve));
  const terminalPort = terminalServer.address().port;
  const terminalOrigin = `http://127.0.0.1:${terminalPort}`;
  detachTerminal = attachSandboxTerminalGateway({ server: terminalServer, prisma, terminalManager,
    cookieName: "fixture_session", jwtSecret: "disposable-terminal-session-secret", appOrigin: terminalOrigin,
    logger: { warn() {}, error() {} } });
  const sessionToken = jwt.sign({}, "disposable-terminal-session-secret", {
    subject: users[1].id, issuer: "gitstack-api", audience: "gitstack-web", expiresIn: 60
  });
  terminalClient = net.connect(terminalPort, "127.0.0.1");
  let wire = Buffer.alloc(0);
  let upgraded = false;
  const terminalMessages = [];
  terminalClient.on("data", bytes => {
    wire = Buffer.concat([wire, bytes]);
    if (!upgraded) {
      const split = wire.indexOf("\r\n\r\n");
      if (split < 0) return;
      assert.match(wire.subarray(0, split).toString(), /^HTTP\/1.1 101/);
      wire = wire.subarray(split + 4); upgraded = true;
    }
    while (wire.length >= 2) {
      const type = wire[0] & 15;
      let length = wire[1] & 127;
      let offset = 2;
      if (length === 126) { if (wire.length < 4) break; length = wire.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (wire.length < 10) break; length = Number(wire.readBigUInt64BE(2)); offset = 10; }
      if (wire.length < offset + length) break;
      if (type === 1) terminalMessages.push(JSON.parse(wire.subarray(offset, offset + length).toString()));
      wire = wire.subarray(offset + length);
    }
  });
  terminalClient.on("error", () => {});
  await new Promise(resolve => terminalClient.once("connect", resolve));
  terminalClient.write(`GET /ws/sandboxes/${sessions[1].sandboxId}/terminal?columns=110&rows=35 HTTP/1.1\r\nHost: 127.0.0.1:${terminalPort}\r\nOrigin: ${terminalOrigin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\nSec-WebSocket-Version: 13\r\nCookie: fixture_session=${sessionToken}\r\n\r\n`);
  const waitFor = async (predicate, description) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Actual terminal did not ${description}: ${JSON.stringify(terminalMessages)}`);
  };
  const terminalOutput = () => terminalMessages.filter(item => item.type === "output").map(item => item.data).join("")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
  const terminalInput = data => {
    const payload = Buffer.from(JSON.stringify({ type: "input", data }));
    const mask = randomBytes(4);
    const header = payload.length < 126 ? Buffer.from([0x81, 0x80 | payload.length]) : Buffer.from([0x81, 0xfe, payload.length >> 8, payload.length & 255]);
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i += 1) masked[i] ^= mask[i % 4];
    terminalClient.write(Buffer.concat([header, mask, masked]));
  };
  await waitFor(() => terminalMessages.some(item => item.type === "status" && item.status === "connected"), "open a real shell");
  terminalInput("git status -sb\r");
  await waitFor(() => terminalOutput().includes("test/login-improvement...origin/test/login-improvement"), "execute git status");
  terminalInput("git add unpushed-after-restart.txt && git commit -m 'Save terminal contribution' && git push origin test/login-improvement\r");
  await waitFor(() => terminalOutput().includes("Username for 'http"), "ask for the student username");
  terminalInput("member-1\r");
  await waitFor(() => terminalOutput().includes("Password for 'http"), "ask for the student's own token");
  terminalInput("student-token-1\r");
  await waitFor(() => terminalOutput().includes("test/login-improvement -> test/login-improvement"), "push from the real PTY");
  assert.equal(await git("--git-dir", bare, "rev-parse", branches[1]), await git("-C", pipelineRepo, "rev-parse", "HEAD"));
  assert.ok(requests.some(req => req.user === "member-1" && req.url.includes("git-receive-pack")));
  assert.equal(terminalMessages.some(item => item.type === "mission-progress" || item.type === "error"), false);
  terminalManager.closeAll();
  terminalClient.destroy();
  detachTerminal();
  await new Promise(resolve => terminalServer.close(resolve));
  terminalServer = null;
} finally {
  if (terminalManager) terminalManager.closeAll();
  if (terminalClient) terminalClient.destroy();
  if (detachTerminal) detachTerminal();
  if (terminalServer) await new Promise(resolve => terminalServer.close(resolve));
  for (const relay of isolatedRelays) relay.close();
  if (closeRelays) await closeRelays();
  process.env.PATH = oldPath;
  if (oldState === undefined) delete process.env.GITSTACK_TRANSPORT_DOCKER_STATE;
  else process.env.GITSTACK_TRANSPORT_DOCKER_STATE = oldState;
  for (const name of envNames) {
    if (previousEnv[name] === undefined) delete process.env[name];
    else process.env[name] = previousEnv[name];
  }
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (blockedServer) { blockedServer.closeAllConnections(); await new Promise(resolve => blockedServer.close(resolve)); }
  rmSync(temp, { recursive: true, force: true });
}

console.log("Collaboration Git HTTP passed: stalled sandbox endpoint bypass, all three members' credential prompts/pushes, streaming packs, app restart reattachment, branch/merge/conflict workflow, tmpfs restore and credential cleanup.");
