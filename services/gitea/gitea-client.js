import "dotenv/config";

const baseUrl = (process.env.GITEA_BASE_URL ?? "http://localhost:3002").replace(/\/$/, "");
const internalBaseUrl = (process.env.GITEA_INTERNAL_BASE_URL ?? "http://gitstack-gitea:3000").replace(/\/$/, "");
const token = process.env.GITEA_ADMIN_TOKEN ?? "";
const configuredOwner = (process.env.GITEA_OWNER ?? "").trim();
const configuredOrganization = (process.env.GITEA_ORGANIZATION ?? "gitstack").trim();

function encodePath(value) {
  return encodeURIComponent(String(value));
}

async function parseBody(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function giteaRequest(path, options = {}) {
  if (!token) throw new Error("Gitea API token is not configured. Set GITEA_ADMIN_TOKEN in .env.");
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `token ${token}`,
      ...(options.headers ?? {})
    }
  });
  const body = await parseBody(response);
  if (!response.ok) {
    const detail = typeof body === "string"
      ? body
      : body?.message || body?.error || body?.errors?.map?.((item) => item.message || item).join(", ");
    const error = new Error(detail ? `Gitea API error (${response.status}): ${detail}` : `Gitea API error: ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export function giteaConfigured() { return Boolean(token); }
export function giteaOwner() { return configuredOwner; }
export function giteaOrganization() { return configuredOrganization; }
export function giteaBaseUrl() { return baseUrl; }
export function giteaInternalBaseUrl() { return internalBaseUrl; }

export async function giteaServiceCloneUrl(owner, repo) {
  if (!token) throw new Error("Gitea API token is not configured.");
  const serviceUser = await getCurrentUser();
  const url = new URL(`${internalBaseUrl}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.git`);
  url.username = serviceUser.login;
  url.password = token;
  return url.toString();
}

export async function getCurrentUser() { return giteaRequest("/user"); }
export async function getUser(username) { return giteaRequest(`/users/${encodePath(username)}`); }

export async function getOrganization(name = configuredOrganization) {
  return giteaRequest(`/orgs/${encodePath(name)}`);
}

export async function ensureOrganization({ name = configuredOrganization, owner = configuredOwner } = {}) {
  if (!name) throw new Error("Gitea organization is not configured. Set GITEA_ORGANIZATION in .env.");
  try { return await getOrganization(name); } catch (error) { if (error.status !== 404) throw error; }

  const payload = {
    username: name,
    full_name: "GitStack",
    description: "GitStack collaboration repositories",
    visibility: "private",
    repo_admin_change_team_access: true
  };

  if (owner) {
    try {
      return await giteaRequest(`/admin/users/${encodePath(owner)}/orgs`, { method: "POST", body: JSON.stringify(payload) });
    } catch (error) {
      if (error.status !== 403 && error.status !== 404) throw error;
    }
  }
  return giteaRequest("/orgs", { method: "POST", body: JSON.stringify(payload) });
}

export async function listRepositories(owner = configuredOwner) {
  const username = owner || (await getCurrentUser()).login;
  return giteaRequest(`/users/${encodePath(username)}/repos?limit=100&page=1`);
}

export async function listOrganizationRepositories(org = configuredOrganization) {
  return giteaRequest(`/orgs/${encodePath(org)}/repos?limit=100&page=1`);
}

export async function createRepository({ owner = configuredOwner, organization = configuredOrganization, name, description = "", private: isPrivate = true }) {
  const payload = { name, description, private: isPrivate, auto_init: true, default_branch: "main" };
  if (organization) return giteaRequest(`/orgs/${encodePath(organization)}/repos`, { method: "POST", body: JSON.stringify(payload) });
  if (owner) return giteaRequest(`/admin/users/${encodePath(owner)}/repos`, { method: "POST", body: JSON.stringify(payload) });
  return giteaRequest("/user/repos", { method: "POST", body: JSON.stringify(payload) });
}

export async function getRepository(owner, repo) { return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}`); }
export async function deleteRepository(owner, repo) { return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}`, { method: "DELETE" }); }
export async function transferRepository(owner, repo, newOwner, teamIds = []) {
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/transfer`, {
    method: "POST",
    body: JSON.stringify({ new_owner: newOwner, ...(teamIds.length ? { team_ids: teamIds } : {}) })
  });
}

export async function listBranches(owner, repo) { return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/branches?limit=100&page=1`); }
export async function createBranch(owner, repo, { newBranchName, oldBranchName, oldRefName }) {
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/branches`, {
    method: "POST",
    body: JSON.stringify({ new_branch_name: newBranchName, ...(oldBranchName ? { old_branch_name: oldBranchName } : {}), ...(oldRefName ? { old_ref_name: oldRefName } : {}) })
  });
}

export async function listCommits(owner, repo, { sha = "", limit = 100 } = {}) {
  const query = new URLSearchParams({ limit: String(limit), page: "1" });
  if (sha) query.set("sha", sha);
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/commits?${query}`);
}

export async function listPullRequests(owner, repo, state = "open") {
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/pulls?state=${encodeURIComponent(state)}&sort=oldest&page=1&limit=100`);
}
export async function getPullRequest(owner, repo, index) { return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/pulls/${encodePath(index)}`); }
export async function createPullRequest({ owner, repo, title, head, base, body = "" }) {
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/pulls`, { method: "POST", body: JSON.stringify({ title, head, base, body }) });
}
export async function listPullRequestReviews(owner, repo, index) {
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/pulls/${encodePath(index)}/reviews?limit=100&page=1`);
}

export async function listIssues(owner, repo, state = "all") {
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/issues?state=${encodeURIComponent(state)}&type=issues&limit=100&page=1`);
}
export async function createIssue(owner, repo, { title, body = "" }) {
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/issues`, { method: "POST", body: JSON.stringify({ title, body }) });
}

export async function listOrganizationTeams(org = configuredOrganization) { return giteaRequest(`/orgs/${encodePath(org)}/teams?limit=100&page=1`); }
export async function createOrganizationTeam(org, { name, description = "", permission = "write" }) {
  return giteaRequest(`/orgs/${encodePath(org)}/teams`, {
    method: "POST",
    body: JSON.stringify({ name, description, permission, can_create_org_repo: false, includes_all_repositories: false, visibility: "private" })
  });
}
export async function addRepositoryToTeam(teamId, org, repo) { return giteaRequest(`/teams/${encodePath(teamId)}/repos/${encodePath(org)}/${encodePath(repo)}`, { method: "PUT" }); }
export async function addTeamMember(teamId, username) { return giteaRequest(`/teams/${encodePath(teamId)}/members/${encodePath(username)}`, { method: "PUT" }); }
export async function removeTeamMember(teamId, username) { return giteaRequest(`/teams/${encodePath(teamId)}/members/${encodePath(username)}`, { method: "DELETE" }); }
export async function listTeamMembers(teamId) { return giteaRequest(`/teams/${encodePath(teamId)}/members?limit=100&page=1`); }
export async function listOrganizationMembers(org = configuredOrganization) { return giteaRequest(`/orgs/${encodePath(org)}/members?limit=100&page=1`); }

export async function listRepositoryHooks(owner, repo) { return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/hooks?limit=100&page=1`); }
export async function createRepositoryWebhook(owner, repo, { url, secret, events = [] }) {
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/hooks`, {
    method: "POST",
    body: JSON.stringify({
      type: "gitea",
      active: true,
      branch_filter: "*",
      config: { url, content_type: "json", secret },
      events
    })
  });
}
export async function updateRepositoryWebhook(owner, repo, hookId, { url, secret, events = [], active = true }) {
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/hooks/${encodePath(hookId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      active,
      branch_filter: "*",
      config: { url, content_type: "json", secret },
      events
    })
  });
}
export async function deleteRepositoryHook(owner, repo, hookId) { return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/hooks/${encodePath(hookId)}`, { method: "DELETE" }); }

export async function getFileContents(owner, repo, filePath, ref = "main") {
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/contents/${filePath.split("/").map(encodePath).join("/")}?ref=${encodeURIComponent(ref)}`);
}
export async function createFile(owner, repo, filePath, { content, message, branch = "main" }) {
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/contents/${filePath.split("/").map(encodePath).join("/")}`, {
    method: "POST",
    body: JSON.stringify({ content: Buffer.from(content, "utf8").toString("base64"), message, branch })
  });
}
export async function updateFile(owner, repo, filePath, { content, message, sha, branch = "main" }) {
  return giteaRequest(`/repos/${encodePath(owner)}/${encodePath(repo)}/contents/${filePath.split("/").map(encodePath).join("/")}`, {
    method: "PUT",
    body: JSON.stringify({ content: Buffer.from(content, "utf8").toString("base64"), message, sha, branch })
  });
}

export async function ensureFile(owner, repo, filePath, { content, message, branch = "main" }) {
  try { return await getFileContents(owner, repo, filePath, branch); }
  catch (error) {
    if (error.status !== 404) throw error;
    return createFile(owner, repo, filePath, { content, message, branch });
  }
}
