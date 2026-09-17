(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;

  const select = document.getElementById("collaborationAssignment");
  const summary = document.getElementById("collaborationSummary");
  const members = document.getElementById("collaborationMembers");
  const timeline = document.getElementById("collaborationTimeline");
  const queryId = new URLSearchParams(location.search).get("assignment");
  let assignments = [];

  function eventLabel(type) { return String(type || "EVENT").replaceAll("_", " "); }

  function render(report) {
    const repo = report.team.repository;
    summary.innerHTML = `<div class="card-head"><div><h3>${G.escapeHtml(report.team.name)} · ${G.escapeHtml(report.mission.title)}</h3><small>${repo ? `${G.escapeHtml(repo.owner)}/${G.escapeHtml(repo.name)}` : "Repository not provisioned"}</small></div><span class="status-chip ${G.statusClass(report.assignment.status)}">${G.statusLabel(report.assignment.status)}</span></div><div class="card-body"><div class="overview-grid"><div class="stat-card"><strong>${report.timeline.length}</strong><span>Recorded events</span></div><div class="stat-card"><strong>${report.assignment.issueNumber ? `#${report.assignment.issueNumber}` : "—"}</strong><span>Mission issue</span></div><div class="stat-card"><strong>${report.runs.filter((r) => r.assessment?.passed).length}/3</strong><span>Students passed</span></div><div class="stat-card"><strong>${report.runs.length ? Math.round(report.runs.reduce((sum,r)=>sum+(r.assessment?.teamScore||0),0)/report.runs.length) : 0}/30</strong><span>Team score</span></div></div>${repo ? `<div class="notice info" style="margin-top:14px"><a target="_blank" rel="noopener" href="${G.escapeHtml(repo.url)}">Open team repository in Gitea</a>${report.assignment.issueUrl ? ` · <a target="_blank" rel="noopener" href="${G.escapeHtml(report.assignment.issueUrl)}">Open mission issue</a>` : ""}</div>` : ""}</div>`;

    members.innerHTML = report.team.members.map((member) => {
      const run = report.runs.find((r) => r.userId === member.userId);
      const a = run?.assessment;
      return `<tr><td><strong>${G.escapeHtml(member.fullName)}</strong><br><small>${G.escapeHtml(member.universityId)}${member.giteaUsername ? ` · @${G.escapeHtml(member.giteaUsername)}` : ""}</small></td><td>${G.escapeHtml(member.roleLabel)}</td><td><span class="status-chip ${G.statusClass(run?.status || "NOT_STARTED")}">${G.statusLabel(run?.status || "NOT_STARTED")}</span></td><td>${a?.individualScore ?? 0}/70</td><td>${a?.teamScore ?? 0}/30</td><td><strong>${a?.totalScore ?? 0}%</strong></td></tr>`;
    }).join("");

    timeline.innerHTML = report.timeline.length ? report.timeline.map((event) => `<div class="activity-item"><span class="activity-icon"><i data-lucide="git-commit-horizontal"></i></span><div><strong>${G.escapeHtml(eventLabel(event.type))}</strong><small>${event.branch ? G.escapeHtml(event.branch) : "Team repository"}${event.resourceId ? ` · ${G.escapeHtml(event.resourceId)}` : ""}</small></div><time>${G.formatDate(event.occurredAt)}</time></div>`).join("") : `<div class="empty-state">No signed Gitea activity has been captured yet.</div>`;
    window.lucide?.createIcons?.();
  }

  async function loadReport(id = select.value) {
    if (!id) return;
    summary.innerHTML = `<div class="card-body"><div class="empty-state">Loading report…</div></div>`;
    const { report } = await G.api(`/api/instructor/assignments/${id}/collaboration-report`);
    render(report);
  }

  async function loadAssignments() {
    const data = await G.api("/api/instructor/assignments");
    assignments = (data.assignments || []).filter((a) => a.mission?.missionType === "TEAM");
    select.innerHTML = `<option value="">Choose a team assignment</option>${assignments.map((a) => `<option value="${a.id}">${G.escapeHtml(a.team?.name || "Team")} · ${G.escapeHtml(a.mission.title)} · ${G.statusLabel(a.status)}</option>`).join("")}`;
    if (queryId && assignments.some((a) => a.id === queryId)) select.value = queryId;
    else if (assignments.length) select.value = assignments[0].id;
    if (select.value) await loadReport();
  }

  select.addEventListener("change", () => loadReport().catch((e) => G.toast(e.message,"error")));
  document.getElementById("refreshCollaboration").addEventListener("click", () => loadReport().catch((e)=>G.toast(e.message,"error")));
  document.getElementById("prepareCollaboration").addEventListener("click", async () => {
    if (!select.value) return G.toast("Choose a team assignment first.", "error");
    try { await G.api(`/api/instructor/assignments/${select.value}/prepare-collaboration`, {method:"POST"}); G.toast("Collaboration workspace prepared.","success"); await loadReport(); }
    catch(e){ G.toast(e.message,"error"); }
  });
  document.getElementById("assessCollaboration").addEventListener("click", async () => {
    if (!select.value) return G.toast("Choose a team assignment first.", "error");
    try { await G.api(`/api/instructor/assignments/${select.value}/assess-collaboration`, {method:"POST"}); G.toast("Collaboration assessment updated.","success"); await loadReport(); }
    catch(e){ G.toast(e.message,"error"); }
  });

  try { await loadAssignments(); } catch (e) { summary.innerHTML = `<div class="card-body"><div class="empty-state">${G.escapeHtml(e.message)}</div></div>`; }
})();
