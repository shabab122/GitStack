(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;

  const grid = document.getElementById("repoGrid");
  const count = document.getElementById("repoCount");
  const status = document.getElementById("giteaStatus");
  const repoModal = document.getElementById("repoModal");
  const detailsModal = document.getElementById("detailsModal");
  const repoForm = document.getElementById("repoForm");
  const teamSelect = document.getElementById("repoTeam");
  let repositories = [];
  let teams = [];
  let selectedRepo = null;

  const close = (modal) => { modal.hidden = true; };
  document.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", () => close(repoModal)));
  document.querySelectorAll("[data-close-details]").forEach((b) => b.addEventListener("click", () => close(detailsModal)));
  document.getElementById("openRepoModal").addEventListener("click", () => { document.getElementById("repoMessage").className = "form-message"; repoModal.hidden = false; window.lucide?.createIcons?.(); });
  document.getElementById("setupOrganization").addEventListener("click", setupOrganization);
  document.getElementById("refreshRepos").addEventListener("click", loadRepositories);

  function renderStatus(data) {
    const connected = data.connected;
    status.innerHTML = `<div class="status-dot ${connected ? "ok" : "error"}"></div><div><strong>${connected ? "Gitea connection is ready" : "Gitea is not connected"}</strong><span>${connected ? `Organization: ${G.escapeHtml(data.organization || "not configured")} · ${data.organizationReady ? "ready" : "setup required"}` : G.escapeHtml(data.error || "Check GITEA_BASE_URL and GITEA_ADMIN_TOKEN in .env.")}</span></div>`;
    document.getElementById("setupOrganization").disabled = !connected || Boolean(data.organizationReady);
    document.getElementById("setupOrganization").textContent = data.organizationReady ? "Organization ready" : "Set up organization";
  }

  function renderRepos() {
    count.textContent = `${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}`;
    if (!repositories.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">No repositories found. Create a repository and optionally link it to a three-person GitStack team.</div>`;
      return;
    }
    grid.innerHTML = repositories.map((repo) => `
      <article class="repo-card">
        <div class="repo-card-top"><div><span class="tag ${repo.team ? "green" : "blue"}">${repo.team ? `Team: ${G.escapeHtml(repo.team.name)}` : "Standalone"}</span><h3>${G.escapeHtml(repo.name)}</h3><p>${G.escapeHtml(repo.description || "No description")}</p></div><span class="tag ${repo.private ? "orange" : "blue"}">${repo.private ? "Private" : "Public"}</span></div>
        <div class="repo-meta"><span class="tag">${G.escapeHtml(repo.defaultBranch)}</span><span class="tag">${repo.openPullRequests} open PRs</span><span class="tag">${repo.stars} stars</span></div>
        <div class="repo-actions"><button class="secondary-action" type="button" data-details="${G.escapeHtml(repo.owner)}" data-repo="${G.escapeHtml(repo.name)}">Manage</button>${repo.htmlUrl ? `<a class="secondary-action repo-link" target="_blank" rel="noopener" href="${G.escapeHtml(repo.htmlUrl)}">Open Gitea</a>` : ""}${repo.team ? `<button class="secondary-action" type="button" data-sync="${G.escapeHtml(repo.owner)}" data-repo="${G.escapeHtml(repo.name)}">Sync access</button>` : ""}${repo.team && repo.owner !== (window.__giteaOrganization || "gitstack") ? `<button class="secondary-action" type="button" data-transfer="${G.escapeHtml(repo.owner)}" data-repo="${G.escapeHtml(repo.name)}">Move to organization</button>` : ""}<button class="danger-action" type="button" data-delete="${G.escapeHtml(repo.owner)}" data-repo="${G.escapeHtml(repo.name)}">Delete</button></div>
      </article>`).join("");
    grid.querySelectorAll("[data-details]").forEach((b) => b.addEventListener("click", () => openDetails(b.dataset.details, b.dataset.repo)));
    grid.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => deleteRepo(b.dataset.delete, b.dataset.repo)));
    grid.querySelectorAll("[data-sync]").forEach((b) => b.addEventListener("click", () => syncAccess(b.dataset.sync, b.dataset.repo)));
    grid.querySelectorAll("[data-transfer]").forEach((b) => b.addEventListener("click", () => transferRepo(b.dataset.transfer, b.dataset.repo)));
    window.lucide?.createIcons?.();
  }

  async function loadStatus() { try { const data = await G.api("/api/gitea/status"); window.__giteaOrganization = data.organization || "gitstack"; renderStatus(data); } catch (e) { renderStatus({ connected:false, error:e.message }); } }
  async function setupOrganization() {
    const button = document.getElementById("setupOrganization");
    button.disabled = true;
    try { await G.api("/api/gitea/organization/setup", { method:"POST" }); G.toast("GitStack Gitea organization is ready.", "success"); await Promise.all([loadStatus(), loadRepositories()]); }
    catch (e) { G.toast(e.message, "error"); button.disabled = false; }
  }
  async function loadTeams() {
    const data = await G.api("/api/instructor/teams"); teams = data.teams || [];
    teamSelect.innerHTML = `<option value="">Choose a GitStack team</option>` + teams.map((team) => `<option value="${team.id}" ${team.giteaReady ? "disabled" : ""}>${G.escapeHtml(team.name)}${team.giteaReady ? " · repository already linked" : ""}</option>`).join("");
  }
  async function loadRepositories() {
    try { const data = await G.api("/api/gitea/repositories"); repositories = data.repositories || []; renderRepos(); }
    catch (e) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${G.escapeHtml(e.message)}</div>`; count.textContent = "Unavailable"; }
  }

  repoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.getElementById("repoMessage");
    message.className = "form-message";
    try {
      const teamId = teamSelect.value || undefined;
      const data = await G.api("/api/gitea/repositories", { method:"POST", body: JSON.stringify({ name:document.getElementById("repoName").value, description:document.getElementById("repoDescription").value, private:document.getElementById("repoPrivate").checked, teamId }) });
      message.className = "form-message success show"; message.textContent = "Repository created successfully.";
      G.toast("Gitea repository created.", "success");
      setTimeout(() => close(repoModal), 350);
      repoForm.reset(); document.getElementById("repoPrivate").checked = true;
      await Promise.all([loadRepositories(), loadTeams()]);
    } catch (e) { message.className = "form-message show"; message.textContent = e.message; }
  });

  async function transferRepo(owner, repo) {
    if (!confirm(`Move ${owner}/${repo} into the GitStack organization? This preserves the repository history and changes its Gitea owner.`)) return;
    try { await G.api(`/api/gitea/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/transfer`, {method:"POST"}); G.toast("Repository moved to the GitStack organization.", "success"); await Promise.all([loadStatus(), loadRepositories(), loadTeams()]); }
    catch (e) { G.toast(e.message, "error"); }
  }

  async function syncAccess(owner, repo) {
    try { const data = await G.api(`/api/gitea/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/access/sync`, {method:"POST"}); const pending = (data.access?.members || []).filter((m) => !m.added); G.toast(pending.length ? `Access synced. ${pending.length} member(s) still need Gitea usernames.` : "Team access synchronized.", pending.length ? "info" : "success"); await loadRepositories(); }
    catch (e) { G.toast(e.message, "error"); }
  }

  async function deleteRepo(owner, repo) {
    if (!confirm(`Delete ${owner}/${repo} from Gitea? This cannot be undone.`)) return;
    try { await G.api(`/api/gitea/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {method:"DELETE"}); G.toast("Repository deleted.", "success"); await Promise.all([loadRepositories(), loadTeams()]); }
    catch (e) { G.toast(e.message, "error"); }
  }

  async function openDetails(owner, repo) {
    selectedRepo = { owner, repo };
    const item = repositories.find((r) => r.owner === owner && r.name === repo);
    document.getElementById("detailsTitle").textContent = `${owner}/${repo}`;
    document.getElementById("detailsSubtitle").textContent = item?.description || "Repository management";
    document.getElementById("repoDetailActions").innerHTML = `${item?.htmlUrl ? `<a class="secondary-action repo-link" target="_blank" rel="noopener" href="${G.escapeHtml(item.htmlUrl)}">Open Gitea</a>` : ""}${item?.team ? `<button class="secondary-action" type="button" id="detailSyncAccess">Sync team access</button>` : ""}`;
    document.getElementById("detailSyncAccess")?.addEventListener("click", () => syncAccess(owner, repo));
    detailsModal.hidden = false;
    await refreshDetails();
  }

  async function refreshDetails() {
    const { owner, repo } = selectedRepo;
    const item = repositories.find((repository) => repository.owner === owner && repository.name === repo);
    const [branches, pulls] = await Promise.all([G.api(`/api/gitea/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`), G.api(`/api/gitea/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open`)]);
    document.getElementById("branchList").innerHTML = (branches.branches || []).length ? branches.branches.map((b) => `<div class="detail-item"><strong>${G.escapeHtml(b.name)}</strong><span>${b.commit?.id ? G.escapeHtml(b.commit.id.slice(0, 10)) : ""}</span></div>`).join("") : `<div class="empty-state">No branches found.</div>`;
    document.getElementById("pullList").innerHTML = (pulls.pullRequests || []).length ? pulls.pullRequests.map((pr) => `<div class="detail-item"><strong>#${pr.number} · ${G.escapeHtml(pr.title)}</strong><span>${G.escapeHtml(pr.user?.login || "Unknown")} · ${G.escapeHtml(pr.head?.name || "")} → ${G.escapeHtml(pr.base?.name || "")}</span></div>`).join("") : `<div class="empty-state">No open Pull Requests.</div>`;
    document.getElementById("repoAccessSummary").innerHTML = item?.team ? `<div class="notice info"><strong>${G.escapeHtml(item.team.name)}</strong> uses the Gitea organization team <code>${G.escapeHtml(item.team.giteaTeamName || "pending")}</code> with write access. Use “Sync team access” after students link their Gitea usernames.</div>` : `<div class="notice info">This repository is not linked to a GitStack team.</div>`;
  }

  document.getElementById("branchForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const {owner,repo}=selectedRepo;
    try { await G.api(`/api/gitea/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`, {method:"POST", body:JSON.stringify({newBranchName:document.getElementById("newBranchName").value, oldBranchName:document.getElementById("oldBranchName").value || undefined})}); G.toast("Branch created.","success"); event.target.reset(); await refreshDetails(); } catch(e){G.toast(e.message,"error");}
  });
  document.getElementById("pullForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const {owner,repo}=selectedRepo;
    try { await G.api(`/api/gitea/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, {method:"POST", body:JSON.stringify({title:document.getElementById("prTitle").value,head:document.getElementById("prHead").value,base:document.getElementById("prBase").value,body:document.getElementById("prBody").value})}); G.toast("Pull Request created.","success"); event.target.reset(); await refreshDetails(); await loadRepositories(); } catch(e){G.toast(e.message,"error");}
  });

  try { await Promise.all([loadStatus(), loadTeams(), loadRepositories()]); } catch (e) { G.toast(e.message, "error"); }
})();
