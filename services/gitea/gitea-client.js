import "dotenv/config";

const baseUrl = process.env.GITEA_BASE_URL ?? "http://localhost:3001";
const token = process.env.GITEA_ADMIN_TOKEN ?? "";

async function giteaRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `token ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`Gitea API error: ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

export async function createRepository({ owner, name, description }) {
  return giteaRequest(`/api/v1/user/repos`, {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      private: false,
      auto_init: true
    })
  });
}

export async function createPullRequest({ owner, repo, title, head, base, body }) {
  return giteaRequest(`/api/v1/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title,
      head,
      base,
      body
    })
  });
}

export async function getRepository(owner, repo) {
  return giteaRequest(`/api/v1/repos/${owner}/${repo}`);
}
