import crypto from "node:crypto";

import {
  addRepositoryToTeam,
  addTeamMember,
  createBranch,
  createIssue,
  createOrganizationTeam,
  createRepository,
  createRepositoryWebhook,
  ensureFile,
  ensureOrganization,
  getFileContents,
  getRepository,
  giteaBaseUrl,
  giteaConfigured,
  giteaInternalBaseUrl,
  giteaOrganization,
  giteaOwner,
  giteaServiceCloneUrl,
  listIssues,
  listOrganizationTeams,
  listRepositoryHooks,
  listTeamMembers,
  removeTeamMember,
  updateRepositoryWebhook
} from "../gitea/gitea-client.js";
import { createSandbox, startSandbox } from "../sandbox/sandbox-service.js";
import { runTrustedMissionScript } from "../student/sandbox-exec.js";

const ROLE_BRANCH = Object.freeze({
  FEATURE_DEVELOPER: "feature/login-improvement",
  TEST_DEVELOPER: "test/login-improvement",
  CODE_REVIEWER: "review/login-improvement"
});

const ROLE_LABEL = Object.freeze({
  FEATURE_DEVELOPER: "Feature Developer",
  TEST_DEVELOPER: "Test Developer",
  CODE_REVIEWER: "Code Reviewer"
});

const EVENT_POINTS = Object.freeze({
  ISSUE: 4,
  BRANCH: 4,
  COMMIT: 3,
  PUSH: 4,
  PULL_REQUEST: 8,
  REVIEW: 7,
  APPROVAL: 8,
  CHANGES_REQUESTED: 8,
  TEST: 7,
  MERGE: 10,
  CONFLICT_RESOLUTION: 10
});

const WEBHOOK_EVENTS = [
  "create",
  "push",
  "issues",
  "pull_request",
  "pull_request_review"
];

const COLLABORATION_ISSUE_TITLE = "[GitStack] Login Improvement Collaboration Mission";
const FINAL_CONFLICT_VALUE = "AUTH_MODE=secure-verified";

function safeRepoName(team) {
  const base = String(team.name || "team")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55) || "team";
  return `${base}-${team.id.slice(0, 8)}`;
}

function webhookTargetUrl() {
  return (process.env.GITEA_WEBHOOK_TARGET_URL || "http://host.docker.internal:3000/api/gitea/webhook").trim();
}

function webhookSecret() {
  return (process.env.GITEA_WEBHOOK_SECRET || "").trim();
}

export function collaborationRoleLabel(role) {
  return ROLE_LABEL[role] || role || "Team member";
}

export function roleBranch(role) {
  return ROLE_BRANCH[role] || "feature/collaboration";
}

function teamInclude() {
  return {
    members: {
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            universityId: true,
            giteaUsername: true,
            role: true,
            isActive: true
          }
        }
      },
      orderBy: { joinedAt: "asc" }
    }
  };
}

async function ensureGiteaTeamAccess({ prisma, team }) {
  const org = giteaOrganization();
  await ensureOrganization({ name: org, owner: giteaOwner() });

  const desiredName = team.giteaTeamName || `gitstack-team-${team.id.slice(0, 8)}`;
  const teams = await listOrganizationTeams(org);
  let remoteTeam = teams.find((item) => item.name === desiredName) || null;
  if (!remoteTeam) {
    remoteTeam = await createOrganizationTeam(org, {
      name: desiredName,
      description: `GitStack access team for ${team.name}`,
      permission: "write"
    });
  }

  if (team.giteaRepository) {
    await addRepositoryToTeam(remoteTeam.id, org, team.giteaRepository);
  }

  const desiredUsers = new Set(
    team.members
      .filter((member) => member.user.isActive && member.user.role === "STUDENT" && member.user.giteaUsername)
      .map((member) => member.user.giteaUsername.trim())
      .filter(Boolean)
  );

  const existingMembers = await listTeamMembers(remoteTeam.id).catch(() => []);
  const existingUsers = new Set(existingMembers.map((member) => member.login));

  const results = [];
  for (const member of team.members) {
    const username = member.user.giteaUsername?.trim() || "";
    if (!username) {
      results.push({ userId: member.user.id, username: null, added: false, reason: "Gitea username is not linked." });
      continue;
    }
    try {
      await addTeamMember(remoteTeam.id, username);
      results.push({ userId: member.user.id, username, added: true });
    } catch (error) {
      results.push({ userId: member.user.id, username, added: false, reason: error.message });
    }
  }

  for (const remoteMember of existingUsers) {
    if (!desiredUsers.has(remoteMember)) {
      await removeTeamMember(remoteTeam.id, remoteMember).catch(() => {});
    }
  }

  await prisma.team.update({
    where: { id: team.id },
    data: { giteaTeamId: Number(remoteTeam.id), giteaTeamName: remoteTeam.name }
  });

  return {
    team: { id: Number(remoteTeam.id), name: remoteTeam.name, permission: remoteTeam.permission || "write" },
    members: results
  };
}

async function ensureWebhook({ prisma, team }) {
  const target = webhookTargetUrl();
  const secret = webhookSecret();
  if (!target || !secret || !team.giteaOwner || !team.giteaRepository) {
    return { configured: false, reason: "Webhook target or secret is not configured." };
  }

  const hooks = await listRepositoryHooks(team.giteaOwner, team.giteaRepository).catch(() => []);
  let hook = hooks.find((item) => item?.config?.url === target) || null;
  if (!hook) {
    hook = await createRepositoryWebhook(team.giteaOwner, team.giteaRepository, {
      url: target,
      secret,
      events: WEBHOOK_EVENTS
    });
  } else {
    // Repair an older/partial hook so upgrades receive the complete event set
    // and use the current shared secret.
    hook = await updateRepositoryWebhook(team.giteaOwner, team.giteaRepository, hook.id, {
      url: target,
      secret,
      events: WEBHOOK_EVENTS,
      active: true
    });
  }
  await prisma.team.update({ where: { id: team.id }, data: { giteaWebhookId: Number(hook.id) } });
  return { configured: true, id: Number(hook.id), target };
}

async function seedCollaborationRepository(owner, repo) {
  const missionText = `# GitStack Collaboration Mission

## Roles
- Feature Developer: use \`feature/login-improvement\`, change \`AUTH_MODE=legacy\` to \`AUTH_MODE=secure-feature\` and \`FEATURE_FLAG=off\` to \`FEATURE_FLAG=enabled\`, make at least two meaningful commits, open a Pull Request that references the mission issue, and respond after the Reviewer requests changes.
- Test Developer: use \`test/login-improvement\`, independently change the same conflict line to \`AUTH_MODE=secure-tested\` and \`TEST_GUARD=off\` to \`TEST_GUARD=enabled\`, add test work, and open a Pull Request. Before resolving the conflict, run \`sh tests/verify-login-policy.sh\` and record a \`FAIL:\` explanation in \`tests/test-evidence.md\`. After the Feature PR is merged, bring \`main\` into your branch, resolve the intentional conflict to \`${FINAL_CONFLICT_VALUE}\`, preserve both role-specific changes, rerun the test, and record a \`PASS:\` explanation.
- Code Reviewer: review the real Gitea Pull Requests, write a specific review comment, request changes before the final approval, verify the test evidence, approve only after the requested fixes, and merge in the required order.

## Required issue-to-merge workflow
Issue -> Branch -> Commit -> Push -> Pull Request -> Review -> Requested Changes -> Update -> Automated Test -> Approval -> Merge -> Controlled Conflict Resolution -> Final Merge.

Every Pull Request must reference the generated mission issue (for example, \`Closes #<issue-number>\`).

## Deterministic conflict
The Feature Developer and Test Developer start from the same original \`main\` branch and deliberately edit the same \`AUTH_MODE\` line in \`src/login-policy.txt\`. Merge the Feature PR first. The Test Developer must then update from \`main\`, resolve the resulting conflict, and preserve this final line:

\`\`\`
${FINAL_CONFLICT_VALUE}
\`\`\`

No conflict markers may remain in the final file. The final file must also preserve \`FEATURE_FLAG=enabled\` and \`TEST_GUARD=enabled\`, proving that required functionality from both development branches remains.

## Automated test evidence
Run this test before and after conflict resolution:

\`\`\`bash
sh tests/verify-login-policy.sh
\`\`\`

The script must fail before the controlled resolution and pass afterwards. Create \`tests/test-evidence.md\` with a \`FAIL:\` line explaining the pre-resolution failure and a \`PASS:\` line explaining the final passing state before approval and merge.
`;

  await ensureFile(owner, repo, "COLLABORATION_MISSION.md", {
    content: missionText,
    message: "GitStack: add collaboration mission brief"
  });
  await ensureFile(owner, repo, "src/login-policy.txt", {
    content: "AUTH_MODE=legacy\nFEATURE_FLAG=off\nTEST_GUARD=off\nSESSION_POLICY=basic\n",
    message: "GitStack: seed deterministic conflict target"
  });
  await ensureFile(owner, repo, "tests/README.md", {
    content: "# Test evidence\n\nRecord `FAIL: <reason>` before conflict resolution and `PASS: <final verification>` after `sh tests/verify-login-policy.sh` succeeds.\n",
    message: "GitStack: add test evidence instructions"
  });
  await ensureFile(owner, repo, "tests/verify-login-policy.sh", {
    content: "#!/bin/sh\nset -eu\nif grep -qx 'AUTH_MODE=secure-verified' src/login-policy.txt && grep -qx 'FEATURE_FLAG=enabled' src/login-policy.txt && grep -qx 'TEST_GUARD=enabled' src/login-policy.txt && ! grep -Eq '^(<<<<<<<|=======|>>>>>>>)' src/login-policy.txt; then\n  echo 'PASS: login policy preserves feature and test changes and is conflict-free'\n  exit 0\nfi\necho 'FAIL: resolve the conflict and preserve AUTH_MODE=secure-verified, FEATURE_FLAG=enabled and TEST_GUARD=enabled' >&2\nexit 1\n",
    message: "GitStack: add deterministic collaboration test"
  });
}

async function ensureCollaborationIssue(owner, repo) {
  const issues = await listIssues(owner, repo, "all").catch(() => []);
  let issue = issues.find((item) => item.title === COLLABORATION_ISSUE_TITLE) || null;
  if (!issue) {
    issue = await createIssue(owner, repo, {
      title: COLLABORATION_ISSUE_TITLE,
      body: "Complete the GitStack role-based collaboration mission. Every Pull Request must reference this issue. The Reviewer must request changes before final approval, tests must be evidenced, and the controlled conflict must be resolved before the final merge."
    });
  }
  return issue;
}

async function ensureRoleBranches(owner, repo) {
  const results = {};
  for (const [role, branch] of Object.entries(ROLE_BRANCH)) {
    try {
      results[role] = await createBranch(owner, repo, { newBranchName: branch, oldBranchName: "main" });
    } catch (error) {
      if (error.status === 409 || error.status === 422) results[role] = { name: branch, alreadyExists: true };
      else throw error;
    }
  }
  return results;
}

export async function provisionTeamRepository({ prisma, teamId, privateRepo = true, repositoryName = null, description = null }) {
  if (!giteaConfigured()) throw new Error("Gitea is not configured. Add GITEA_ADMIN_TOKEN to .env.");
  let team = await prisma.team.findUnique({ where: { id: teamId }, include: teamInclude() });
  if (!team) throw new Error("Team not found.");

  await ensureOrganization({ name: giteaOrganization(), owner: giteaOwner() });

  let repository = null;
  if (team.giteaRepositoryId && team.giteaOwner && team.giteaRepository) {
    try { repository = await getRepository(team.giteaOwner, team.giteaRepository); }
    catch (error) {
      if (error.status !== 404) throw error;
      await prisma.team.update({ where: { id: team.id }, data: { giteaOwner: null, giteaRepository: null, giteaRepositoryId: null, giteaRepositoryUrl: null, giteaProvisionedAt: null, giteaWebhookId: null } });
      team = await prisma.team.findUnique({ where: { id: team.id }, include: teamInclude() });
    }
  }

  if (!repository) {
    const name = repositoryName || safeRepoName(team);
    repository = await createRepository({
      organization: giteaOrganization(),
      name,
      description: description || `GitStack collaboration repository for ${team.name}`,
      private: privateRepo
    });
    await prisma.team.update({
      where: { id: team.id },
      data: {
        giteaOwner: repository.owner?.login || giteaOrganization(),
        giteaRepository: repository.name,
        giteaRepositoryId: Number(repository.id),
        giteaRepositoryUrl: repository.html_url || `${giteaBaseUrl()}/${giteaOrganization()}/${repository.name}`,
        giteaProvisionedAt: new Date()
      }
    });
  }

  team = await prisma.team.findUnique({ where: { id: team.id }, include: teamInclude() });
  await seedCollaborationRepository(team.giteaOwner, team.giteaRepository);
  const access = await ensureGiteaTeamAccess({ prisma, team });
  team = await prisma.team.findUnique({ where: { id: team.id }, include: teamInclude() });
  const webhook = await ensureWebhook({ prisma, team });

  return { team, repository, access, webhook };
}

async function ensureMissionRuns({ prisma, assignment, team }) {
  const runs = [];
  for (const member of team.members) {
    let run = await prisma.missionRun.findFirst({
      where: { assignmentId: assignment.id, userId: member.userId },
      orderBy: { createdAt: "desc" }
    });
    if (!run) {
      run = await prisma.missionRun.create({
        data: {
          missionTemplateId: assignment.missionTemplateId,
          assignmentId: assignment.id,
          userId: member.userId,
          teamId: team.id,
          teamRole: member.teamRole,
          status: "NOT_STARTED",
          progressPercent: 0,
          repositoryUrl: team.giteaRepositoryUrl,
          giteaRepositoryId: team.giteaRepositoryId
        }
      });
    } else if (run.teamRole !== member.teamRole || run.giteaRepositoryId !== team.giteaRepositoryId) {
      run = await prisma.missionRun.update({
        where: { id: run.id },
        data: { teamRole: member.teamRole, repositoryUrl: team.giteaRepositoryUrl, giteaRepositoryId: team.giteaRepositoryId, teamId: team.id }
      });
    }
    runs.push(run);
  }
  return runs;
}

export async function prepareCollaborationAssignment({ prisma, assignmentId }) {
  let assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { missionTemplate: true, team: { include: teamInclude() } }
  });
  if (!assignment || !assignment.teamId || assignment.missionTemplate.missionType !== "TEAM") {
    throw new Error("Team collaboration assignment not found.");
  }
  if (assignment.team.members.length !== 3) throw new Error("Collaboration missions require exactly three team members.");

  const provisioned = await provisionTeamRepository({ prisma, teamId: assignment.teamId, privateRepo: true });
  const team = await prisma.team.findUnique({ where: { id: assignment.teamId }, include: teamInclude() });
  const issue = await ensureCollaborationIssue(team.giteaOwner, team.giteaRepository);
  const branches = await ensureRoleBranches(team.giteaOwner, team.giteaRepository);
  const runs = await ensureMissionRuns({ prisma, assignment, team });

  const state = {
    workflow: ["ISSUE", "BRANCH", "COMMIT", "PUSH", "PULL_REQUEST", "REVIEW", "CHANGES_REQUESTED", "TEST", "APPROVAL", "MERGE", "CONFLICT_RESOLUTION"],
    roleBranches: ROLE_BRANCH,
    conflictFile: "src/login-policy.txt",
    finalConflictValue: FINAL_CONFLICT_VALUE,
    testEvidenceFile: "tests/test-evidence.md",
    repositoryInternalUrl: `${giteaInternalBaseUrl()}/${team.giteaOwner}/${team.giteaRepository}.git`
  };

  assignment = await prisma.assignment.update({
    where: { id: assignment.id },
    data: {
      collaborationPreparedAt: new Date(),
      giteaIssueNumber: Number(issue.number ?? issue.index),
      giteaIssueUrl: issue.html_url || null,
      collaborationState: state
    },
    include: { missionTemplate: true, team: true }
  });

  return { assignment, team, issue, branches, runs, ...provisioned };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

export async function startCollaborationWorkspace({ prisma, terminalManager, assignmentId, user }) {
  const prepared = await prepareCollaborationAssignment({ prisma, assignmentId });
  const member = await prisma.teamMember.findFirst({ where: { teamId: prepared.team.id, userId: user.id } });
  if (!member) throw new Error("You are not a member of this collaboration team.");

  let run = await prisma.missionRun.findFirst({ where: { assignmentId, userId: user.id }, orderBy: { createdAt: "desc" } });
  if (!run) throw new Error("Collaboration mission run could not be prepared.");

  const existing = await prisma.sandboxSession.findFirst({
    where: { missionRunId: run.id, userId: user.id, status: { notIn: ["DELETED", "EXPIRED", "FAILED"] } },
    orderBy: { createdAt: "desc" }
  });

  let sandbox;
  if (existing) {
    sandbox = existing.status === "STOPPED"
      ? await startSandbox(existing.sandboxId, user.id, { prisma, terminalManager })
      : existing;
  } else {
    sandbox = await createSandbox(user.id, { prisma, terminalManager, missionRunId: run.id, mode: "collaboration" });
  }

  const serviceCloneUrl = await giteaServiceCloneUrl(prepared.team.giteaOwner, prepared.team.giteaRepository);
  const cleanRemote = `${giteaInternalBaseUrl()}/${prepared.team.giteaOwner}/${prepared.team.giteaRepository}.git`;
  const branch = roleBranch(member.teamRole);
  const identity = user.giteaUsername || `student-${user.id.slice(0, 8)}`;
  const script = [
    "set -e",
    "cd /workspace",
    "if [ ! -d team-repo/.git ]; then",
    `  git clone ${shellQuote(serviceCloneUrl)} team-repo >/tmp/gitstack-clone.log 2>&1`,
    "fi",
    "cd team-repo",
    `git remote set-url origin ${shellQuote(cleanRemote)}`,
    `git config user.name ${shellQuote(identity)}`,
    `git config user.email ${shellQuote(`${identity}@gitstack.local`)}`,
    "git fetch origin --prune || true",
    `git checkout ${shellQuote(branch)} 2>/dev/null || git checkout -b ${shellQuote(branch)} ${shellQuote(`origin/${branch}`)} 2>/dev/null || true`,
    "printf '%s\n' 'GitStack collaboration workspace ready.'"
  ].join("\n");
  await runTrustedMissionScript(sandbox.sandboxId, script, { timeoutMs: 30_000 });

  run = await prisma.missionRun.update({
    where: { id: run.id },
    data: {
      status: "IN_PROGRESS",
      startedAt: run.startedAt || new Date(),
      progressPercent: Math.max(run.progressPercent, 5),
      expiresAt: run.expiresAt || new Date(Date.now() + 120 * 60 * 1000)
    }
  });

  return {
    run,
    sandbox,
    role: member.teamRole,
    roleLabel: collaborationRoleLabel(member.teamRole),
    branch,
    repository: {
      owner: prepared.team.giteaOwner,
      name: prepared.team.giteaRepository,
      url: prepared.team.giteaRepositoryUrl,
      cloneUrl: `${giteaBaseUrl()}/${prepared.team.giteaOwner}/${prepared.team.giteaRepository}.git`
    },
    issue: { number: prepared.assignment.giteaIssueNumber, url: prepared.assignment.giteaIssueUrl }
  };
}

export function verifyGiteaSignature(rawBody, signature) {
  const secret = webhookSecret();
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = String(signature).trim();
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function classifyGiteaWebhook(eventName, eventTypeName, payload = {}) {
  const normalized = String(eventName || "").toLowerCase();
  const specific = String(eventTypeName || "").toLowerCase();

  if (normalized === "issues") return ["ISSUE"];
  if (normalized === "create" && payload.ref_type === "branch") return ["BRANCH"];
  if (normalized === "push") return ["PUSH"];

  // Gitea uses pull_request_review as the subscription group, while deliveries
  // can use specific event types such as pull_request_review_approved. Check the
  // specific header before the broader pull_request event to avoid misclassifying
  // review deliveries on installations that normalize X-Gitea-Event differently.
  if (specific.includes("pull_request_review_approved") || normalized.includes("review_approved")) return ["APPROVAL"];
  if (specific.includes("pull_request_review_rejected") || normalized.includes("review_rejected")) return ["CHANGES_REQUESTED"];
  if (specific.includes("pull_request_review_comment") || normalized.includes("review_comment")) return ["REVIEW"];

  if (normalized === "pull_request") {
    const types = ["PULL_REQUEST"];
    if (payload.action === "closed" && payload.pull_request?.merged) types.push("MERGE");
    return types;
  }

  if (normalized === "pull_request_review" || specific.startsWith("pull_request_review")) {
    const reviewType = String(payload.review?.type || payload.review?.state || payload.action || "").toUpperCase();
    if (["APPROVED", "APPROVE"].includes(reviewType) || reviewType.endsWith("_APPROVED")) return ["APPROVAL"];
    if (["REQUEST_CHANGES", "REQUESTED_CHANGES", "REJECTED", "REJECT"].includes(reviewType) || reviewType.endsWith("_REJECTED")) return ["CHANGES_REQUESTED"];
    return ["REVIEW"];
  }
  return [];
}

export function extractWebhookBranch(payload = {}, eventType) {
  if (eventType === "BRANCH") return String(payload.ref || "").replace(/^refs\/heads\//, "") || null;
  if (["PUSH", "COMMIT", "TEST"].includes(eventType)) return String(payload.ref || "").replace(/^refs\/heads\//, "") || null;
  if (["PULL_REQUEST", "MERGE", "REVIEW", "APPROVAL", "CHANGES_REQUESTED"].includes(eventType)) {
    return payload.pull_request?.head?.ref || payload.pull_request?.head?.name || null;
  }
  return null;
}

function payloadResourceId(payload, eventType) {
  if (eventType === "ISSUE") return String(payload.issue?.number ?? payload.issue?.id ?? "");
  if (["PULL_REQUEST", "MERGE", "REVIEW", "APPROVAL", "CHANGES_REQUESTED"].includes(eventType)) return String(payload.pull_request?.number ?? payload.pull_request?.id ?? "");
  if (["COMMIT", "TEST"].includes(eventType)) return String(payload.commit?.id || payload.commit?.sha || "");
  if (eventType === "PUSH") return String(payload.after || payload.head_commit?.id || "");
  if (eventType === "BRANCH") return String(payload.ref || "");
  return "";
}

async function resolveActor(prisma, payload) {
  const username = payload.sender?.login || payload.sender?.username || payload.user?.login || payload.pusher?.login || payload.pusher?.username || "";
  if (!username) return null;
  return prisma.user.findFirst({ where: { giteaUsername: { equals: username, mode: "insensitive" } } });
}

async function activeAssignmentForTeam(prisma, teamId) {
  return prisma.assignment.findFirst({
    where: { teamId, missionTemplate: { missionType: "TEAM" }, status: { in: ["ACTIVE", "CLOSED"] } },
    include: { missionTemplate: true },
    orderBy: { createdAt: "desc" }
  });
}

async function chooseRun(prisma, assignmentId, actorUserId) {
  if (actorUserId) {
    const actorRun = await prisma.missionRun.findFirst({ where: { assignmentId, userId: actorUserId }, orderBy: { createdAt: "desc" } });
    if (actorRun) return actorRun;
  }
  return prisma.missionRun.findFirst({ where: { assignmentId }, orderBy: { createdAt: "asc" } });
}

async function storeEvent({ prisma, assignment, team, actor, eventType, eventName, deliveryId, payload, suffix = "" }) {
  const run = await chooseRun(prisma, assignment.id, actor?.id || null);
  if (!run) return null;
  const giteaEventId = `${deliveryId || "delivery"}:${eventType}:${suffix || payloadResourceId(payload, eventType) || "event"}:${run.id}`;
  const occurredAt = new Date(payload.timestamp || payload.pull_request?.updated_at || payload.issue?.updated_at || payload.repository?.updated_at || Date.now());
  try {
    return await prisma.gitEvent.create({
      data: {
        missionRunId: run.id,
        actorUserId: actor?.id || null,
        eventType,
        giteaEventId,
        giteaResourceId: payloadResourceId(payload, eventType) || null,
        deliveryId: deliveryId || null,
        action: payload.action || eventName || null,
        repositoryId: Number(team.giteaRepositoryId) || null,
        branch: extractWebhookBranch(payload, eventType),
        scoreValue: EVENT_POINTS[eventType] || 0,
        occurredAt,
        payload
      }
    });
  } catch (error) {
    if (error.code === "P2002") return null;
    throw error;
  }
}

function commitTouchesTests(commit) {
  const files = [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])].map(String);
  return files.some((file) => /(^|\/)(test|tests|spec|specs)(\/|\.|$)/i.test(file));
}

function eventCommitPaths(event) {
  const commit = event?.payload?.commit || {};
  return [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])].map(String);
}

function eventCommitTouches(event, filePath) {
  return event.eventType === "COMMIT" && eventCommitPaths(event).includes(filePath);
}

export function controlledConflictEvidence({ events, featureUserId, testUserId, finalConflictText }) {
  const featureBranch = roleBranch("FEATURE_DEVELOPER");
  const testBranch = roleBranch("TEST_DEVELOPER");
  const featureTouched = events.some((event) =>
    event.actorUserId === featureUserId && event.branch === featureBranch && eventCommitTouches(event, "src/login-policy.txt")
  );
  const testTouched = events.some((event) =>
    event.actorUserId === testUserId && event.branch === testBranch && eventCommitTouches(event, "src/login-policy.txt")
  );
  const finalLines = new Set(String(finalConflictText || "").split(/\r?\n/));
  const finalStateOk = finalLines.has(FINAL_CONFLICT_VALUE)
    && finalLines.has("FEATURE_FLAG=enabled")
    && finalLines.has("TEST_GUARD=enabled")
    && !/<<<<<<<|=======|>>>>>>>/.test(String(finalConflictText || ""));
  const mergeEvents = events
    .filter((event) => event.eventType === "MERGE")
    .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  const featureMergeIndex = mergeEvents.findIndex((event) => event.branch === featureBranch);
  const testMergeIndex = mergeEvents.findIndex((event) => event.branch === testBranch);
  const mergedTwice = mergeEvents.length >= 2;
  const correctMergeOrder = featureMergeIndex >= 0 && testMergeIndex > featureMergeIndex;
  return {
    passed: featureTouched && testTouched && finalStateOk && mergedTwice && correctMergeOrder,
    featureTouched,
    testTouched,
    finalStateOk,
    mergedTwice,
    correctMergeOrder
  };
}

export async function processGiteaWebhook({ prisma, eventName, eventTypeName = "", deliveryId, payload }) {
  const repo = payload.repository;
  const repositoryId = Number(repo?.id || 0);
  const owner = repo?.owner?.login || repo?.owner?.username || repo?.owner?.name || "";
  const repoName = repo?.name || "";
  if (!repositoryId && (!owner || !repoName)) return { accepted: true, ignored: true, reason: "Repository metadata missing." };

  const team = await prisma.team.findFirst({
    where: repositoryId ? { giteaRepositoryId: repositoryId } : { giteaOwner: owner, giteaRepository: repoName },
    include: teamInclude()
  });
  if (!team) return { accepted: true, ignored: true, reason: "Repository is not linked to a GitStack team." };
  const assignment = await activeAssignmentForTeam(prisma, team.id);
  if (!assignment) return { accepted: true, ignored: true, reason: "No collaboration assignment is linked to this team." };

  await ensureMissionRuns({ prisma, assignment, team });
  const actor = await resolveActor(prisma, payload);
  const stored = [];
  const types = classifyGiteaWebhook(eventName, eventTypeName, payload);
  for (const type of types) {
    const event = await storeEvent({ prisma, assignment, team, actor, eventType: type, eventName, deliveryId, payload });
    if (event) stored.push(event);
  }

  if (String(eventName).toLowerCase() === "push") {
    for (const commit of payload.commits || []) {
      const commitPayload = { ...payload, commit };
      const event = await storeEvent({ prisma, assignment, team, actor, eventType: "COMMIT", eventName, deliveryId, payload: commitPayload, suffix: commit.id || commit.sha || crypto.randomUUID() });
      if (event) stored.push(event);
      if (commitTouchesTests(commit)) {
        const testEvent = await storeEvent({ prisma, assignment, team, actor, eventType: "TEST", eventName, deliveryId, payload: commitPayload, suffix: `test-${commit.id || commit.sha || crypto.randomUUID()}` });
        if (testEvent) stored.push(testEvent);
      }
    }
  }

  const report = await assessCollaborationAssignment({ prisma, assignmentId: assignment.id, awardXp: true });
  return { accepted: true, ignored: false, stored: stored.length, assignmentId: assignment.id, report };
}

async function readTextFile(owner, repo, path, ref = "main") {
  try {
    const file = await getFileContents(owner, repo, path, ref);
    return Buffer.from(file.content || "", "base64").toString("utf8");
  } catch (error) {
    if (error.status === 404) return "";
    throw error;
  }
}

function eventCount(events, type, userId = null) {
  return events.filter((event) => event.eventType === type && (!userId || event.actorUserId === userId)).length;
}

function hasEvent(events, type, userId = null) {
  return eventCount(events, type, userId) > 0;
}

function userEvents(events, userId) {
  return events.filter((event) => event.actorUserId === userId);
}

function rule(code, label, passed, points, earned = passed ? points : 0, details = "") {
  return { code, label, passed: Boolean(passed), points, earned: Math.min(points, Math.max(0, earned)), details };
}

function scoreRules(rules) {
  return Math.round(rules.reduce((sum, item) => sum + item.earned, 0));
}

function requestedThenUpdated(events, userId, branch) {
  const requested = events
    .filter((event) => event.eventType === "CHANGES_REQUESTED" && (!branch || event.branch === branch))
    .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  if (!requested.length) return false;
  const cutoff = new Date(requested[0].occurredAt).getTime();
  return events.some((event) =>
    event.actorUserId === userId
    && ["COMMIT", "PUSH"].includes(event.eventType)
    && (!branch || event.branch === branch)
    && new Date(event.occurredAt).getTime() > cutoff
  );
}

function meaningfulReviewComment(events, reviewerId) {
  return events.some((event) => {
    if (event.eventType !== "REVIEW" || event.actorUserId !== reviewerId) return false;
    const review = event.payload?.review || {};
    const text = String(review.content || review.body || event.payload?.comment?.body || "").trim();
    return text.length >= 8;
  });
}

function requestedChangesBeforeApproval(events, reviewerId) {
  const requests = events
    .filter((event) => event.eventType === "CHANGES_REQUESTED" && event.actorUserId === reviewerId)
    .map((event) => new Date(event.occurredAt).getTime());
  const approvals = events
    .filter((event) => event.eventType === "APPROVAL" && event.actorUserId === reviewerId)
    .map((event) => new Date(event.occurredAt).getTime());
  return requests.some((request) => approvals.some((approval) => approval > request));
}

function approvalAfterTests(events, reviewerId) {
  const tests = events.filter((e) => e.eventType === "TEST").map((e) => new Date(e.occurredAt).getTime());
  const approvals = events.filter((e) => e.eventType === "APPROVAL" && e.actorUserId === reviewerId).map((e) => new Date(e.occurredAt).getTime());
  if (!tests.length || !approvals.length) return false;
  const latestTest = Math.max(...tests);
  return approvals.some((approval) => approval > latestTest);
}

function pullRequestsReferenceIssue(events, issueNumber) {
  if (!issueNumber) return false;
  const re = new RegExp(`(?:#${issueNumber}\\b|(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#${issueNumber}\\b)`, "i");
  const byPr = new Map();
  for (const event of events) {
    if (event.eventType !== "PULL_REQUEST") continue;
    const pr = event.payload?.pull_request || {};
    const key = String(pr.number ?? pr.id ?? event.giteaResourceId ?? event.id);
    byPr.set(key, re.test(`${pr.title || ""}\n${pr.body || ""}`));
  }
  return byPr.size >= 2 && [...byPr.values()].every(Boolean);
}

function meaningfulCommitCount(events, userId, branch) {
  return events.filter((event) => {
    if (event.eventType !== "COMMIT" || event.actorUserId !== userId || event.branch !== branch) return false;
    const message = String(event.payload?.commit?.message || "").trim();
    return message.length >= 8;
  }).length;
}

function roleRules({ role, userId, events, testEvidenceOk, conflictResolved, issueNumber }) {
  const mine = userEvents(events, userId);
  const branch = roleBranch(role);
  const branchUsed = mine.some((e) => ["BRANCH", "PUSH", "COMMIT", "PULL_REQUEST"].includes(e.eventType) && e.branch === branch);
  const commits = meaningfulCommitCount(events, userId, branch);
  const hasPr = mine.some((e) => e.eventType === "PULL_REQUEST" && e.branch === branch);
  if (role === "FEATURE_DEVELOPER") {
    return [
      rule("FEATURE_BRANCH", "Correct feature branch", branchUsed, 15),
      rule("FEATURE_COMMITS", "At least two meaningful commits", commits >= 2, 20, Math.min(20, commits * 10), `${commits} meaningful commit(s)`),
      rule("FEATURE_PR", "Feature Pull Request created", hasPr, 20),
      rule("FEATURE_REVIEW_RESPONSE", "Responded after requested changes", requestedThenUpdated(events, userId, branch), 15)
    ];
  }
  if (role === "TEST_DEVELOPER") {
    return [
      rule("TEST_BRANCH", "Correct test branch", branchUsed, 10),
      rule("TEST_COMMITS", "Meaningful test work committed", commits >= 1, 15, Math.min(15, commits * 15), `${commits} meaningful commit(s)`),
      rule("TEST_EVIDENCE", "Passing automated test evidence recorded", testEvidenceOk && hasEvent(mine, "TEST"), 25),
      rule("TEST_PR", "Test Pull Request created", hasPr, 20)
    ];
  }
  return [
    rule("REVIEW_PARTICIPATION", "Specific Pull Request review comment submitted", meaningfulReviewComment(events, userId), 25),
    rule("REVIEW_REQUEST_CHANGES", "Requested changes before approval", requestedChangesBeforeApproval(events, userId), 20),
    rule("REVIEW_APPROVAL", "Final approval submitted", hasEvent(events, "APPROVAL", userId), 15),
    rule("REVIEW_TIMING", "Approval occurred after test evidence", approvalAfterTests(events, userId), 10)
  ];
}

function teamRules({ events, issueNumber, testEvidenceOk, testEventPresent, conflictEvidence }) {
  const merged = eventCount(events, "MERGE");
  const completeCore = ["ISSUE", "BRANCH", "COMMIT", "PUSH", "PULL_REQUEST", "REVIEW", "CHANGES_REQUESTED", "APPROVAL", "MERGE"].every((type) => hasEvent(events, type));
  const issueLinked = hasEvent(events, "ISSUE") && pullRequestsReferenceIssue(events, issueNumber);
  return [
    rule("TEAM_ISSUE_LINK", "Mission issue is linked from a Pull Request", issueLinked, 6),
    rule("TEAM_WORKFLOW", "Required collaboration workflow completed", completeCore, 8),
    rule("TEAM_TESTS", "Automated test evidence passes", testEvidenceOk && testEventPresent, 6),
    rule("TEAM_CONFLICT", "Controlled merge conflict was created and resolved", conflictEvidence.passed, 6, conflictEvidence.passed ? 6 : 0,
      `feature edit: ${conflictEvidence.featureTouched ? "yes" : "no"}; test edit: ${conflictEvidence.testTouched ? "yes" : "no"}; final state: ${conflictEvidence.finalStateOk ? "yes" : "no"}; merge order: ${conflictEvidence.correctMergeOrder ? "yes" : "no"}`),
    rule("TEAM_MERGE", "Feature PR merged before test/conflict PR", conflictEvidence.correctMergeOrder, 4, conflictEvidence.correctMergeOrder ? 4 : merged > 0 ? 2 : 0, `${merged} merge(s)`)
  ];
}

function banglaFeedback(role, roleRulesList, teamRulesList, passed) {
  if (passed) return "অভিনন্দন! আপনার role-specific কাজ এবং team workflow—issue, branch, commit, Pull Request, review, test, conflict resolution এবং merge—প্রয়োজনীয় মান পূরণ করেছে।";
  const missing = [...roleRulesList, ...teamRulesList].filter((item) => !item.passed).map((item) => item.label);
  const prefix = role === "CODE_REVIEWER"
    ? "Reviewer হিসেবে workflow সম্পূর্ণ করতে"
    : role === "TEST_DEVELOPER"
      ? "Test Developer হিসেবে workflow সম্পূর্ণ করতে"
      : "Feature Developer হিসেবে workflow সম্পূর্ণ করতে";
  return `${prefix} এই অংশগুলো ঠিক করুন: ${missing.join(", ") || "অসম্পূর্ণ workflow"}। তারপর আবার assessment চালান।`;
}

export function evaluateCollaborationEvidence({ members, events, issueNumber, testEvidence, finalConflict }) {
  const featureMember = members.find((member) => member.teamRole === "FEATURE_DEVELOPER");
  const testMember = members.find((member) => member.teamRole === "TEST_DEVELOPER");
  const finalLines = new Set(String(finalConflict || "").split(/\r?\n/));
  const testEvidenceText = String(testEvidence || "");
  const testEvidenceOk = /^\s*FAIL:\s*.{8,}$/im.test(testEvidenceText)
    && /^\s*PASS:\s*.{8,}$/im.test(testEvidenceText)
    && finalLines.has(FINAL_CONFLICT_VALUE)
    && finalLines.has("FEATURE_FLAG=enabled")
    && finalLines.has("TEST_GUARD=enabled")
    && !/<<<<<<<|=======|>>>>>>>/.test(String(finalConflict || ""));
  const testEventPresent = Boolean(testMember) && hasEvent(events, "TEST", testMember.userId);
  const conflictEvidence = controlledConflictEvidence({
    events,
    featureUserId: featureMember?.userId || null,
    testUserId: testMember?.userId || null,
    finalConflictText: finalConflict
  });
  const sharedTeamRules = teamRules({ events, issueNumber, testEvidenceOk, testEventPresent, conflictEvidence });
  const teamScore = scoreRules(sharedTeamRules);
  const workflowComplete = sharedTeamRules.every((item) => item.passed) && hasEvent(events, "APPROVAL");
  const memberResults = members.map((member) => {
    const role = member.teamRole;
    const individualRules = roleRules({
      role,
      userId: member.userId,
      events,
      testEvidenceOk,
      conflictResolved: conflictEvidence.passed,
      issueNumber
    });
    const individualScore = scoreRules(individualRules);
    const totalScore = individualScore + teamScore;
    return {
      userId: member.userId,
      role,
      individualRules,
      individualScore,
      teamScore,
      totalScore,
      passed: workflowComplete && totalScore >= 70
    };
  });
  return {
    testEvidenceOk,
    testEventPresent,
    conflictEvidence,
    conflictResolved: conflictEvidence.passed,
    teamRules: sharedTeamRules,
    teamScore,
    workflowComplete,
    memberResults
  };
}

export async function assessCollaborationAssignment({ prisma, assignmentId, awardXp = false }) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      missionTemplate: true,
      team: { include: teamInclude() },
      missionRuns: { include: { gitEvents: true, assessmentResult: true } }
    }
  });
  if (!assignment || !assignment.teamId || assignment.missionTemplate.missionType !== "TEAM") throw new Error("Collaboration assignment not found.");

  const runs = assignment.missionRuns.length ? assignment.missionRuns : await ensureMissionRuns({ prisma, assignment, team: assignment.team });
  const runIds = runs.map((run) => run.id);
  const events = await prisma.gitEvent.findMany({ where: { missionRunId: { in: runIds } }, orderBy: { occurredAt: "asc" } });
  const owner = assignment.team.giteaOwner;
  const repo = assignment.team.giteaRepository;
  const testEvidence = owner && repo ? await readTextFile(owner, repo, "tests/test-evidence.md", "main") : "";
  const finalConflict = owner && repo ? await readTextFile(owner, repo, "src/login-policy.txt", "main") : "";
  let evaluation = evaluateCollaborationEvidence({
    members: assignment.team.members,
    events,
    issueNumber: assignment.giteaIssueNumber,
    testEvidence,
    finalConflict
  });
  const { conflictEvidence, conflictResolved } = evaluation;

  if (conflictResolved && !hasEvent(events, "CONFLICT_RESOLUTION")) {
    const targetRun = runs.find((run) => run.teamRole === "TEST_DEVELOPER") || runs[0];
    await prisma.gitEvent.create({
      data: {
        missionRunId: targetRun.id,
        actorUserId: targetRun.userId,
        eventType: "CONFLICT_RESOLUTION",
        giteaEventId: `derived:conflict:${assignment.id}`,
        giteaResourceId: "src/login-policy.txt",
        action: "derived",
        repositoryId: assignment.team.giteaRepositoryId,
        branch: "main",
        scoreValue: EVENT_POINTS.CONFLICT_RESOLUTION,
        occurredAt: new Date(),
        payload: { source: "repository-state", finalValue: FINAL_CONFLICT_VALUE }
      }
    }).catch((error) => { if (error.code !== "P2002") throw error; });
    events.push(...await prisma.gitEvent.findMany({ where: { giteaEventId: `derived:conflict:${assignment.id}` } }));
  }

  // Re-evaluate after adding any derived conflict event so reports reflect the
  // final event timeline while preserving deterministic state-based checks.
  evaluation = evaluateCollaborationEvidence({
    members: assignment.team.members,
    events,
    issueNumber: assignment.giteaIssueNumber,
    testEvidence,
    finalConflict
  });
  const {
    testEvidenceOk,
    testEventPresent,
    teamRules: sharedTeamRules,
    teamScore,
    workflowComplete
  } = evaluation;
  const results = [];

  for (const member of assignment.team.members) {
    const run = runs.find((item) => item.userId === member.userId);
    if (!run) continue;
    const role = run.teamRole || member.teamRole;
    const evaluatedMember = evaluation.memberResults.find((item) => item.userId === member.userId);
    const individualRules = evaluatedMember?.individualRules || [];
    const individualScore = evaluatedMember?.individualScore || 0;
    // Role rules intentionally total 70 points and team rules total 30 points,
    // so adding the two is the documented 70/30 weighted score.
    const totalScore = evaluatedMember?.totalScore || teamScore;
    const passed = Boolean(evaluatedMember?.passed);
    const now = new Date();
    const alreadyCompleted = run.status === "COMPLETED" && run.xpAwarded > 0;
    const xpAward = passed && awardXp && !alreadyCompleted ? assignment.missionTemplate.xpReward : 0;
    const feedbackMessage = banglaFeedback(role, individualRules, sharedTeamRules, passed);

    await prisma.$transaction(async (tx) => {
      await tx.assessmentResult.upsert({
        where: { missionRunId: run.id },
        create: { missionRunId: run.id, individualScore, teamScore, totalScore, passed, ruleResults: { role, individual: individualRules, team: sharedTeamRules, workflowComplete, testEvidenceOk, testEventPresent, conflictResolved, conflictEvidence }, assessedAt: now },
        update: { individualScore, teamScore, totalScore, passed, ruleResults: { role, individual: individualRules, team: sharedTeamRules, workflowComplete, testEvidenceOk, testEventPresent, conflictResolved, conflictEvidence }, assessedAt: now }
      });
      await tx.feedback.deleteMany({ where: { missionRunId: run.id, code: { startsWith: "COLLAB_" } } });
      await tx.feedback.create({ data: { missionRunId: run.id, userId: member.userId, code: passed ? "COLLAB_COMPLETED" : "COLLAB_NEEDS_WORK", language: "bn", message: feedbackMessage, details: { role, individualScore, teamScore, totalScore } } });
      await tx.missionRun.update({
        where: { id: run.id },
        data: {
          status: passed ? "COMPLETED" : run.status === "NOT_STARTED" ? "NOT_STARTED" : "IN_PROGRESS",
          progressPercent: Math.min(100, totalScore),
          completedAt: passed ? now : null,
          lastSubmittedAt: now,
          submissionCount: { increment: 1 },
          ...(xpAward ? { xpAwarded: xpAward } : {})
        }
      });
      if (xpAward) await tx.user.update({ where: { id: member.userId }, data: { xp: { increment: xpAward } } });
    });

    results.push({ userId: member.userId, role, roleLabel: collaborationRoleLabel(role), individualScore, teamScore, totalScore, passed, xpAwarded: xpAward, individualRules, teamRules: sharedTeamRules, feedback: feedbackMessage });
  }

  if (workflowComplete && results.every((item) => item.passed)) {
    await prisma.assignment.update({ where: { id: assignment.id }, data: { status: "CLOSED" } });
  }

  return {
    assignmentId: assignment.id,
    teamId: assignment.team.id,
    mission: { id: assignment.missionTemplate.id, slug: assignment.missionTemplate.slug, title: assignment.missionTemplate.title },
    issue: { number: assignment.giteaIssueNumber, url: assignment.giteaIssueUrl },
    workflowComplete,
    testEvidenceOk,
    testEventPresent,
    conflictResolved,
    conflictEvidence,
    teamScore,
    teamRules: sharedTeamRules,
    results,
    eventCount: events.length
  };
}

export async function getCollaborationReport({ prisma, assignmentId }) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      missionTemplate: true,
      team: { include: teamInclude() },
      missionRuns: {
        include: {
          user: true,
          gitEvents: { orderBy: { occurredAt: "asc" } },
          assessmentResult: true,
          feedback: { orderBy: { createdAt: "desc" }, take: 2 },
          sandboxSessions: { where: { status: { not: "DELETED" } }, orderBy: { createdAt: "desc" }, take: 1 }
        }
      }
    }
  });
  if (!assignment || !assignment.team) throw new Error("Collaboration assignment not found.");
  const events = assignment.missionRuns.flatMap((run) => run.gitEvents).sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  return {
    assignment: {
      id: assignment.id,
      status: assignment.status,
      preparedAt: assignment.collaborationPreparedAt,
      issueNumber: assignment.giteaIssueNumber,
      issueUrl: assignment.giteaIssueUrl,
      state: assignment.collaborationState
    },
    mission: { id: assignment.missionTemplate.id, slug: assignment.missionTemplate.slug, title: assignment.missionTemplate.title, description: assignment.missionTemplate.description },
    team: {
      id: assignment.team.id,
      name: assignment.team.name,
      repository: assignment.team.giteaRepositoryId ? { owner: assignment.team.giteaOwner, name: assignment.team.giteaRepository, url: assignment.team.giteaRepositoryUrl, teamName: assignment.team.giteaTeamName } : null,
      members: assignment.team.members.map((member) => ({ userId: member.userId, fullName: member.user.fullName, universityId: member.user.universityId, giteaUsername: member.user.giteaUsername, role: member.teamRole, roleLabel: collaborationRoleLabel(member.teamRole) }))
    },
    runs: assignment.missionRuns.map((run) => ({
      id: run.id,
      userId: run.userId,
      role: run.teamRole,
      status: run.status,
      progressPercent: run.progressPercent,
      assessment: run.assessmentResult,
      feedback: run.feedback,
      sandbox: run.sandboxSessions[0] || null
    })),
    timeline: events.map((event) => ({
      id: event.id,
      type: event.eventType,
      actorUserId: event.actorUserId,
      action: event.action,
      branch: event.branch,
      resourceId: event.giteaResourceId,
      scoreValue: event.scoreValue,
      occurredAt: event.occurredAt
    }))
  };
}

export async function resyncTeamAccess({ prisma, teamId }) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, include: teamInclude() });
  if (!team || !team.giteaRepositoryId) throw new Error("Team repository is not provisioned.");
  return ensureGiteaTeamAccess({ prisma, team });
}
