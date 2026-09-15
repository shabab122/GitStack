import express from "express";
import { z } from "zod";
import {
  addRepositoryToTeam,
  addTeamMember,
  createBranch,
  createOrganizationTeam,
  createPullRequest,
  createRepository,
  deleteRepository,
  transferRepository,
  ensureOrganization,
  getCurrentUser,
  getOrganization,
  getRepository,
  giteaConfigured,
  giteaOrganization,
  giteaOwner,
  listOrganizationMembers,
  listOrganizationRepositories,
  listRepositories,
  listOrganizationTeams,
  listBranches,
  listPullRequests
} from "../services/gitea/gitea-client.js";

const repoNameSchema = z.string().trim().min(2).max(100).regex(/^[a-zA-Z0-9._-]+$/);
const ownerSchema = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/);
const repoParams = z.object({ owner: ownerSchema, repo: repoNameSchema });
const createRepoSchema = z.object({
  name: repoNameSchema,
  description: z.string().trim().max(500).optional().default(""),
  private: z.boolean().optional().default(true),
  teamId: z.string().uuid()
});
const branchSchema = z.object({
  newBranchName: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._/-]+$/),
  oldBranchName: z.string().trim().max(200).optional(),
  oldRefName: z.string().trim().max(200).optional()
});
const pullRequestSchema = z.object({
  title: z.string().trim().min(3).max(200),
  head: z.string().trim().min(1).max(200),
  base: z.string().trim().min(1).max(200),
  body: z.string().trim().max(10000).optional().default("")
});

function ensureConfigured(res) {
  if (!giteaConfigured()) {
    res.status(503).json({ error: "Gitea is not configured. Set GITEA_ADMIN_TOKEN in .env." });
    return false;
  }
  return true;
}

function publicRepository(repository) {
  return {
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    owner: repository.owner?.login || "",
    description: repository.description || "",
    private: Boolean(repository.private),
    empty: Boolean(repository.empty),
    defaultBranch: repository.default_branch || "main",
    htmlUrl: repository.html_url || "",
    cloneUrl: repository.clone_url || "",
    sshUrl: repository.ssh_url || "",
    createdAt: repository.created_at || null,
    updatedAt: repository.updated_at || null,
    openPullRequests: repository.open_pr_counter ?? 0,
    stars: repository.stars_count ?? 0,
    forks: repository.forks_count ?? 0
  };
}

async function instructorCanManageTeam(prisma, req, teamId) {
  if (String(req.user.role).toUpperCase() === "ADMIN") return true;
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      OR: [
        { createdById: req.user.id },
        { assignments: { some: { createdById: req.user.id } } }
      ]
    },
    select: { id: true }
  });
  return Boolean(team);
}

async function findTeamForRepo(prisma, owner, repo) {
  return prisma.team.findFirst({
    where: { giteaOwner: owner, giteaRepository: repo },
    include: {
      members: { include: { user: { select: { id: true, fullName: true, giteaUsername: true, role: true, isActive: true } } } },
      _count: { select: { assignments: true, missionRuns: true } }
    }
  });
}

async function ensureTeamAccess({ prisma, team }) {
  const org = giteaOrganization();
  if (!org) throw new Error("Gitea organization is not configured. Set GITEA_ORGANIZATION in .env.");

  const organization = await ensureOrganization({ name: org, owner: giteaOwner() });
  const teamName = team.giteaTeamName || `gitstack-team-${team.id.slice(0, 8)}`;
  let giteaTeam = null;
  const teams = await listOrganizationTeams(org);
  giteaTeam = teams.find((item) => item.name === teamName) || null;
  if (!giteaTeam) {
    giteaTeam = await createOrganizationTeam(org, {
      name: teamName,
      description: `GitStack access team for ${team.name}`,
      permission: "write"
    });
  }

  if (team.giteaRepository) {
    await addRepositoryToTeam(giteaTeam.id, org, team.giteaRepository);
  }

  const results = [];
  for (const member of team.members) {
    const username = member.user.giteaUsername?.trim();
    if (!username) {
      results.push({ userId: member.user.id, username: null, added: false, reason: "Gitea username is not linked in GitStack." });
      continue;
    }
    if (!member.user.isActive || member.user.role !== "STUDENT") {
      results.push({ userId: member.user.id, username, added: false, reason: "Only active student accounts are synced." });
      continue;
    }
    try {
      await addTeamMember(giteaTeam.id, username);
      results.push({ userId: member.user.id, username, added: true });
    } catch (error) {
      results.push({ userId: member.user.id, username, added: false, reason: error.message });
    }
  }

  await prisma.team.update({
    where: { id: team.id },
    data: { giteaTeamId: Number(giteaTeam.id), giteaTeamName: giteaTeam.name }
  });

  return {
    organization: organization.username || org,
    team: { id: giteaTeam.id, name: giteaTeam.name, permission: giteaTeam.permission || "write" },
    members: results
  };
}

export function createGiteaRouter({ requireAuth, prisma }) {
  const router = express.Router();
  router.use(requireAuth, (req, res, next) => {
    if (!["INSTRUCTOR", "ADMIN"].includes(String(req.user.role).toUpperCase())) {
      return res.status(403).json({ error: "Instructor access is required." });
    }
    next();
  });

  router.get("/status", async (_req, res) => {
    try {
      if (!giteaConfigured()) return res.json({ configured: false, connected: false, owner: giteaOwner() || null, organization: giteaOrganization() || null });
      const user = await getCurrentUser();
      let organization = null;
      let organizationReady = false;
      try {
        organization = await getOrganization(giteaOrganization());
        organizationReady = true;
      } catch (error) {
        if (error.status !== 404) throw error;
      }
      res.json({
        configured: true,
        connected: true,
        owner: giteaOwner() || user.login,
        organization: giteaOrganization() || null,
        organizationReady,
        user: { login: user.login, fullName: user.full_name || user.login }
      });
    } catch (error) {
      res.json({ configured: true, connected: false, owner: giteaOwner() || null, organization: giteaOrganization() || null, organizationReady: false, error: error.message });
    }
  });

  router.post("/organization/setup", async (req, res, next) => {
    try {
      if (!ensureConfigured(res)) return;
      const organization = await ensureOrganization();
      res.status(201).json({ organization: { username: organization.username || giteaOrganization(), fullName: organization.full_name || "GitStack" } });
    } catch (error) { next(error); }
  });

  router.get("/repositories", async (req, res, next) => {
    try {
      if (!ensureConfigured(res)) return;
      const isAdmin = String(req.user.role).toUpperCase() === "ADMIN";
      const teams = await prisma.team.findMany({
        where: {
          giteaRepositoryId: { not: null },
          ...(isAdmin ? {} : { OR: [{ createdById: req.user.id }, { assignments: { some: { createdById: req.user.id } } }] })
        },
        select: { id: true, name: true, giteaOwner: true, giteaRepository: true, giteaRepositoryId: true, giteaTeamId: true, giteaTeamName: true }
      });
      let repositories = [];
      let source = "organization";
      try {
        repositories = await listOrganizationRepositories(giteaOrganization());
      } catch (error) {
        if (error.status !== 404) throw error;
        source = "legacy";
        const owner = giteaOwner() || (await getCurrentUser()).login;
        repositories = await listRepositories(owner);
      }
      const allowedIds = new Set(teams.map((team) => team.giteaRepositoryId));
      repositories = repositories.filter((repo) => isAdmin || allowedIds.has(repo.id));
      const legacyTeams = teams.filter((team) => team.giteaOwner && team.giteaRepository && team.giteaOwner !== giteaOrganization());
      if (legacyTeams.length) {
        const legacyRepositories = await Promise.all(legacyTeams.map(async (team) => {
          try { return await getRepository(team.giteaOwner, team.giteaRepository); } catch { return null; }
        }));
        const existing = new Set(repositories.map((repo) => `${repo.owner?.login}/${repo.name}`));
        for (const repo of legacyRepositories.filter(Boolean)) {
          const key = `${repo.owner?.login}/${repo.name}`;
          if (!existing.has(key)) repositories.push(repo);
        }
      }
      const teamByRepoId = new Map(teams.map((team) => [team.giteaRepositoryId, team]));
      res.json({
        owner: giteaOrganization() || giteaOwner() || repositories[0]?.owner?.login || null,
        organization: giteaOrganization() || null,
        source,
        repositories: repositories.map((repo) => ({
          ...publicRepository(repo),
          access: teamByRepoId.get(repo.id) ? "manage" : "view",
          team: teamByRepoId.get(repo.id) ? {
            id: teamByRepoId.get(repo.id).id,
            name: teamByRepoId.get(repo.id).name,
            giteaTeamId: teamByRepoId.get(repo.id).giteaTeamId,
            giteaTeamName: teamByRepoId.get(repo.id).giteaTeamName
          } : null
        }))
      });
    } catch (error) { next(error); }
  });

  router.post("/repositories", async (req, res, next) => {
    try {
      if (!ensureConfigured(res)) return;
      const input = createRepoSchema.parse(req.body);
      const canManage = await instructorCanManageTeam(prisma, req, input.teamId);
      if (!canManage) return res.status(403).json({ error: "You can only provision repositories for teams you manage." });
      const team = await prisma.team.findUnique({
        where: { id: input.teamId },
        include: { members: { include: { user: { select: { id: true, fullName: true, giteaUsername: true, role: true, isActive: true } } } } }
      });
      if (!team) return res.status(404).json({ error: "Team not found." });
      if (team.giteaRepositoryId) return res.status(409).json({ error: "This team already has a Gitea repository." });

      await ensureOrganization();
      const repository = await createRepository({ organization: giteaOrganization(), name: input.name, description: input.description, private: input.private });
      await prisma.team.update({ where: { id: team.id }, data: {
        giteaOwner: repository.owner?.login || giteaOrganization(),
        giteaRepository: repository.name,
        giteaRepositoryId: repository.id,
        giteaRepositoryUrl: repository.html_url || null,
        giteaProvisionedAt: new Date()
      }});
      const refreshedTeam = await prisma.team.findUnique({
        where: { id: team.id },
        include: { members: { include: { user: { select: { id: true, fullName: true, giteaUsername: true, role: true, isActive: true } } } } }
      });
      const access = await ensureTeamAccess({ prisma, team: refreshedTeam });
      res.status(201).json({ repository: publicRepository(repository), teamId: team.id, organization: giteaOrganization(), access });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid repository details.", fields: error.issues });
      next(error);
    }
  });

  router.get("/repositories/:owner/:repo", async (req, res, next) => {
    try {
      if (!ensureConfigured(res)) return;
      const params = repoParams.parse(req.params);
      const repository = await getRepository(params.owner, params.repo);
      const team = await findTeamForRepo(prisma, params.owner, params.repo);
      if (team && !(await instructorCanManageTeam(prisma, req, team.id))) return res.status(403).json({ error: "You do not manage this repository." });
      res.json({ repository: publicRepository(repository), team: team ? { id: team.id, name: team.name, giteaTeamId: team.giteaTeamId, giteaTeamName: team.giteaTeamName } : null });
    } catch (error) { next(error); }
  });

  router.post("/repositories/:owner/:repo/access/sync", async (req, res, next) => {
    try {
      if (!ensureConfigured(res)) return;
      const params = repoParams.parse(req.params);
      const team = await findTeamForRepo(prisma, params.owner, params.repo);
      if (!team) return res.status(404).json({ error: "This repository is not linked to a GitStack team." });
      if (!(await instructorCanManageTeam(prisma, req, team.id))) return res.status(403).json({ error: "You do not manage this team repository." });
      if (params.owner !== giteaOrganization()) return res.status(409).json({ error: "This is a legacy user-owned repository. New GitStack repositories are organization-owned; recreate this repository from the Instructor Gitea page to enable team access synchronization." });
      const access = await ensureTeamAccess({ prisma, team });
      res.json({ message: "Gitea team access synchronized.", access });
    } catch (error) { next(error); }
  });

  router.post("/repositories/:owner/:repo/transfer", async (req, res, next) => {
    try {
      if (!ensureConfigured(res)) return;
      const params = repoParams.parse(req.params);
      const team = await findTeamForRepo(prisma, params.owner, params.repo);
      if (!team) return res.status(404).json({ error: "This repository is not linked to a GitStack team." });
      if (!(await instructorCanManageTeam(prisma, req, team.id))) return res.status(403).json({ error: "You do not manage this team repository." });
      if (params.owner === giteaOrganization()) return res.status(409).json({ error: "This repository already belongs to the GitStack organization." });

      await ensureOrganization();
      const teamName = team.giteaTeamName || `gitstack-team-${team.id.slice(0, 8)}`;
      const orgTeams = await listOrganizationTeams(giteaOrganization());
      let giteaTeam = orgTeams.find((item) => item.name === teamName);
      if (!giteaTeam) giteaTeam = await createOrganizationTeam(giteaOrganization(), { name: teamName, description: `GitStack access team for ${team.name}`, permission: "write" });

      const repository = await transferRepository(params.owner, params.repo, giteaOrganization(), [Number(giteaTeam.id)]);
      await prisma.team.update({ where: { id: team.id }, data: { giteaOwner: giteaOrganization(), giteaRepository: repository.name, giteaRepositoryId: repository.id, giteaRepositoryUrl: repository.html_url || null, giteaTeamId: Number(giteaTeam.id), giteaTeamName: giteaTeam.name } });
      const refreshed = await findTeamForRepo(prisma, giteaOrganization(), repository.name);
      const access = await ensureTeamAccess({ prisma, team: refreshed });
      res.json({ message: "Repository transferred to the GitStack organization.", repository: publicRepository(repository), access });
    } catch (error) { next(error); }
  });

  router.delete("/repositories/:owner/:repo", async (req, res, next) => {
    try {
      if (!ensureConfigured(res)) return;
      const params = repoParams.parse(req.params);
      const team = await findTeamForRepo(prisma, params.owner, params.repo);
      if (team) {
        if (!(await instructorCanManageTeam(prisma, req, team.id))) return res.status(403).json({ error: "You do not manage this team repository." });
        if (team._count.assignments > 0 || team._count.missionRuns > 0) {
          return res.status(409).json({ error: "This repository is linked to a team with assignment or mission history. It cannot be deleted from GitStack." });
        }
      } else if (String(req.user.role).toUpperCase() !== "ADMIN") {
        return res.status(403).json({ error: "Only an administrator can delete an unlinked repository." });
      }
      await deleteRepository(params.owner, params.repo);
      if (team) await prisma.team.update({ where: { id: team.id }, data: { giteaOwner: null, giteaRepository: null, giteaRepositoryId: null, giteaRepositoryUrl: null, giteaProvisionedAt: null, giteaTeamId: null, giteaTeamName: null } });
      res.json({ message: "Repository deleted." });
    } catch (error) { next(error); }
  });

  router.get("/repositories/:owner/:repo/branches", async (req, res, next) => {
    try {
      if (!ensureConfigured(res)) return;
      const params = repoParams.parse(req.params);
      const team = await findTeamForRepo(prisma, params.owner, params.repo);
      if (team && !(await instructorCanManageTeam(prisma, req, team.id))) return res.status(403).json({ error: "You do not manage this repository." });
      res.json({ branches: await listBranches(params.owner, params.repo) });
    } catch (error) { next(error); }
  });

  router.post("/repositories/:owner/:repo/branches", async (req, res, next) => {
    try {
      if (!ensureConfigured(res)) return;
      const params = repoParams.parse(req.params);
      const team = await findTeamForRepo(prisma, params.owner, params.repo);
      if (team && !(await instructorCanManageTeam(prisma, req, team.id))) return res.status(403).json({ error: "You do not manage this repository." });
      const input = branchSchema.parse(req.body);
      res.status(201).json({ branch: await createBranch(params.owner, params.repo, input) });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid branch details.", fields: error.issues });
      next(error);
    }
  });

  router.get("/repositories/:owner/:repo/pulls", async (req, res, next) => {
    try {
      if (!ensureConfigured(res)) return;
      const params = repoParams.parse(req.params);
      const team = await findTeamForRepo(prisma, params.owner, params.repo);
      if (team && !(await instructorCanManageTeam(prisma, req, team.id))) return res.status(403).json({ error: "You do not manage this repository." });
      const state = ["open", "closed", "all"].includes(req.query.state) ? req.query.state : "open";
      res.json({ pullRequests: await listPullRequests(params.owner, params.repo, state) });
    } catch (error) { next(error); }
  });

  router.post("/repositories/:owner/:repo/pulls", async (req, res, next) => {
    try {
      if (!ensureConfigured(res)) return;
      const params = repoParams.parse(req.params);
      const team = await findTeamForRepo(prisma, params.owner, params.repo);
      if (team && !(await instructorCanManageTeam(prisma, req, team.id))) return res.status(403).json({ error: "You do not manage this repository." });
      const input = pullRequestSchema.parse(req.body);
      res.status(201).json({ pullRequest: await createPullRequest({ ...params, ...input }) });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid Pull Request details.", fields: error.issues });
      next(error);
    }
  });

  router.get("/organization/members", async (_req, res, next) => {
    try {
      if (!ensureConfigured(res)) return;
      res.json({ members: (await listOrganizationMembers(giteaOrganization())).map((member) => ({ login: member.login, fullName: member.full_name || member.login })) });
    } catch (error) { next(error); }
  });

  return router;
}
