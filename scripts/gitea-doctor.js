import "dotenv/config";

const baseUrl = (process.env.GITEA_BASE_URL || "http://localhost:3002").replace(/\/$/, "");
const token = (process.env.GITEA_ADMIN_TOKEN || "").trim();
const organization = (process.env.GITEA_ORGANIZATION || "gitstack").trim();

function fail(message) {
  console.error(`Gitea doctor: ${message}`);
  process.exitCode = 1;
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { response, body };
}

if (!token) {
  fail("GITEA_ADMIN_TOKEN is empty. Generate an access token in Gitea with repository, organization and user Read/Write scopes and add it to .env.");
} else {
  try {
    const { response: userResponse, body: user } = await request("/user");
    if (!userResponse.ok) {
      fail(`API authentication failed (${userResponse.status}). ${typeof user === "string" ? user.slice(0, 240) : JSON.stringify(user).slice(0, 240)}`);
    } else {
      console.log(`Gitea API authentication: OK (${user.login})`);

      let orgReady = false;
      const orgCheck = await request(`/orgs/${encodeURIComponent(organization)}`);
      if (orgCheck.response.ok) {
        orgReady = true;
        console.log(`Gitea organization: OK (${organization})`);
      } else if (orgCheck.response.status === 404) {
        const created = await request("/orgs", {
          method: "POST",
          body: JSON.stringify({
            username: organization,
            full_name: "GitStack",
            description: "GitStack collaboration repositories",
            visibility: "private",
            repo_admin_change_team_access: true
          })
        });
        if (created.response.ok) {
          orgReady = true;
          console.log(`Gitea organization creation: OK (${organization})`);
        } else {
          fail(`organization create permission failed (${created.response.status}). ${JSON.stringify(created.body).slice(0, 300)}`);
        }
      } else {
        fail(`organization lookup failed (${orgCheck.response.status}). ${JSON.stringify(orgCheck.body).slice(0, 300)}`);
      }

      if (orgReady && !process.exitCode) {
        const testRepo = `gitstack-doctor-${Date.now()}`;
        const created = await request(`/orgs/${encodeURIComponent(organization)}/repos`, {
          method: "POST",
          body: JSON.stringify({
            name: testRepo,
            description: "Temporary GitStack permission diagnostic repository",
            private: true,
            auto_init: true,
            default_branch: "main"
          })
        });
        if (!created.response.ok) {
          fail(`repository write permission failed (${created.response.status}). ${JSON.stringify(created.body).slice(0, 300)}`);
        } else {
          console.log("Gitea repository write permission: OK");
          const deleted = await request(`/repos/${encodeURIComponent(organization)}/${encodeURIComponent(testRepo)}`, { method: "DELETE" });
          if (deleted.response.ok || deleted.response.status === 204) {
            console.log("Gitea repository cleanup permission: OK");
          } else {
            fail(`temporary repository cleanup failed (${deleted.response.status}). Delete ${organization}/${testRepo} manually.`);
          }
        }
      }
    }
  } catch (error) {
    fail(`cannot reach ${baseUrl}: ${error.message}`);
  }
}

if (!process.exitCode) console.log("Gitea doctor: all required API checks passed.");
