(async () => {
  "use strict";
  const G = window.GitStackStudent;
  const user = await G.ensureStudent();
  if (!user) return;
  const root = document.getElementById("teamRoot");
  const roles = ["FEATURE_DEVELOPER", "TEST_DEVELOPER", "CODE_REVIEWER"];
  const roleBranches = {
    FEATURE_DEVELOPER: "feature/login-improvement",
    TEST_DEVELOPER: "test/login-improvement",
    CODE_REVIEWER: "review/login-improvement"
  };

  function roleOptions(selected = "") {
    return roles.map((role) => `<option value="${role}" ${role === selected ? "selected" : ""}>${G.escapeHtml(G.roleLabel(role))}</option>`).join("");
  }

  function eventLabel(type) {
    return String(type || "EVENT").replaceAll("_", " ");
  }

  function renderCollaborationReport(report) {
    const target = document.getElementById("collaborationReportRoot");
    if (!target) return;
    const myRun = report.myRun || null;
    const assessment = myRun?.assessment || null;
    const rules = assessment?.ruleResults || {};
    const individualRules = Array.isArray(rules.individual) ? rules.individual : [];
    const teamRules = Array.isArray(rules.team) ? rules.team : [];
    target.hidden = false;
    target.innerHTML = `<div class="card-head"><div><h3>Collaboration assessment</h3><small>${G.escapeHtml(report.mission?.title || "Team mission")}</small></div><span class="tag ${assessment?.passed ? "green" : "dark"}">${assessment ? `${assessment.totalScore}%` : "Not assessed"}</span></div><div class="card-body">
      <div class="gitea-repo-summary"><div><strong>Your role: ${G.escapeHtml(G.roleLabel(myRun?.role) || "Team member")}</strong><small>Individual ${assessment?.individualScore ?? 0}/70 · Team ${assessment?.teamScore ?? 0}/30 · Total ${assessment?.totalScore ?? 0}%</small></div></div>
      <div class="collaboration-rule-grid">${[...individualRules, ...teamRules].map((rule) => `<div class="detail-item"><strong>${rule.passed ? "✓" : "○"} ${G.escapeHtml(rule.label || rule.code)}</strong><span>${rule.earned ?? 0}/${rule.points ?? 0}</span></div>`).join("") || `<div class="empty-state">Run “Check workflow” after your team starts working.</div>`}</div>
      <h4 style="margin-top:18px">Gitea activity timeline</h4><div class="collaboration-timeline">${(report.timeline || []).length ? report.timeline.map((event) => `<div class="history-row"><div><strong>${G.escapeHtml(eventLabel(event.type))}</strong><small>${event.branch ? G.escapeHtml(event.branch) : "Team repository"}${event.resourceId ? ` · #${G.escapeHtml(event.resourceId)}` : ""}</small></div><span>${G.formatDate(event.occurredAt)}</span></div>`).join("") : `<div class="empty-state">No signed Gitea events recorded yet. Push a branch or open a Pull Request to begin the timeline.</div>`}</div>
      ${myRun?.feedback?.[0]?.message ? `<div class="notice info" style="margin-top:15px"><strong>বাংলা feedback:</strong> ${G.escapeHtml(myRun.feedback[0].message)}</div>` : ""}
    </div>`;
  }

  async function loadCollaborationReport(assignmentId) {
    const { report } = await G.api(`/api/student/team/assignments/${assignmentId}/report`);
    renderCollaborationReport(report);
  }

  function bindCollaborationActions() {
    document.querySelectorAll("[data-collab-start]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const data = await G.api(`/api/student/team/assignments/${button.dataset.collabStart}/start`, { method: "POST" });
        const sandboxId = data.workspace?.sandbox?.sandboxId;
        G.toast("Collaboration workspace is ready.", "success");
        if (sandboxId) window.location.assign(`sandbox-terminal.html?sandbox=${encodeURIComponent(sandboxId)}&collaboration=1`);
      } catch (error) { G.toast(error.message, "error"); button.disabled = false; }
    }));
    document.querySelectorAll("[data-collab-assess]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await G.api(`/api/student/team/assignments/${button.dataset.collabAssess}/assess`, { method: "POST" });
        G.toast("Collaboration workflow assessed.", "success");
        await loadCollaborationReport(button.dataset.collabAssess);
      } catch (error) { G.toast(error.message, "error"); } finally { button.disabled = false; }
    }));
    document.querySelectorAll("[data-collab-report]").forEach((button) => button.addEventListener("click", async () => {
      try { await loadCollaborationReport(button.dataset.collabReport); } catch (error) { G.toast(error.message, "error"); }
    }));
  }

  function renderExistingTeam(team) {
    const gitea = team.gitea;
    const cloneUrl = gitea?.url ? `${gitea.url}.git` : "";
    const myBranch = roleBranches[team.role] || "feature/collaboration";
    root.innerHTML = `
      <section class="page-intro" style="margin-top:-10px"><div><div class="mission-meta"><span class="tag">${G.escapeHtml(G.roleLabel(team.role) || "Member")}</span></div><h2>${G.escapeHtml(team.name)}</h2><p>Your team repository is the shared source of truth for collaboration work. Use branches, commits and Pull Requests instead of changing the main branch directly.</p></div></section>
      ${gitea ? `<section class="card gitea-student-card"><div class="card-head"><div><h3><i data-lucide="github"></i> Team Gitea repository</h3><small>Owned by the GitStack organization; access is controlled through your team.</small></div><span class="tag green">${G.escapeHtml(gitea.teamName || "Team access")}</span></div><div class="card-body"><div class="gitea-repo-summary"><div><strong>${G.escapeHtml(gitea.owner)}/${G.escapeHtml(gitea.repository)}</strong><small>Default branch: ${G.escapeHtml(gitea.defaultBranch || "main")}</small></div><div class="team-builder-actions"><a class="primary-action" target="_blank" rel="noopener" href="${G.escapeHtml(gitea.url)}">Open Gitea</a><button class="secondary-action" id="copyCloneUrl" type="button">Copy clone URL</button></div></div><div class="clone-box"><label>Clone URL</label><code id="studentCloneUrl">${G.escapeHtml(cloneUrl)}</code></div><div class="gitea-workflow"><h4>Your collaboration workflow</h4><ol><li>Use <strong>Start collaboration workspace</strong> below to open your separate Docker clone.</li><li>Your assigned branch is <code>${G.escapeHtml(myBranch)}</code>.</li><li>Make the role-specific changes in <code>COLLABORATION_MISSION.md</code>, then commit meaningful work.</li><li>Push with <code>git push -u origin ${G.escapeHtml(myBranch)}</code>. When Git asks for credentials, use your Gitea username and a personal Gitea access token as the password.</li><li>Use the real Gitea UI for Pull Requests/reviews. Every PR must reference the generated mission issue.</li></ol></div><div class="notice info">Your GitStack Gitea username: <strong>${G.escapeHtml(team.currentStudentGiteaUsername || "Not linked yet")}</strong>. If it is not linked, add it on your Profile page, then ask the instructor to synchronize team access.</div></div></section>` : `<section class="card"><div class="card-body"><div class="empty-state"><strong>Your team repository is not provisioned yet.</strong><br>The instructor must create the team repository before you can start the shared Gitea workflow.</div></div></section>`}
      <section class="team-layout">
        <div class="card"><div class="card-head"><h3>Team members</h3></div><div class="card-body">${team.members.map((member) => `
          <div class="team-member"><div class="member-left"><span class="avatar">${G.escapeHtml((member.fullName || "?")[0])}</span><div><strong>${G.escapeHtml(member.fullName)}</strong><small>${G.escapeHtml(member.universityId)} • ${G.escapeHtml(G.roleLabel(member.teamRole) || "Role pending")}</small></div></div><span class="tag">${member.xp} XP</span></div>`).join("")}</div></div>
        <div class="card"><div class="card-head"><h3>Assignments</h3></div><div class="card-body">${team.assignments.length ? team.assignments.map((a) => `
          <div class="history-row collaboration-assignment-row"><div><strong>${G.escapeHtml(a.mission.title)}</strong><small>${G.escapeHtml(a.mission.description)}</small>${a.issueNumber ? `<small>Issue #${a.issueNumber}${a.issueUrl ? ` · <a target="_blank" rel="noopener" href="${G.escapeHtml(a.issueUrl)}">Open issue</a>` : ""}</small>` : ""}</div><span class="status-chip ${G.statusClass(a.status)}">${G.statusLabel(a.status)}</span></div>
          ${a.status === "ACTIVE" || a.status === "CLOSED" ? `<div class="team-builder-actions collaboration-actions"><button class="primary-action" type="button" data-collab-start="${a.id}">${a.run?.sandbox ? "Continue workspace" : "Start collaboration workspace"}</button><button class="secondary-action" type="button" data-collab-assess="${a.id}">Check workflow</button><button class="secondary-action" type="button" data-collab-report="${a.id}">View report</button></div>` : ""}
          ${a.run ? `<div class="notice info" style="margin-top:8px">Your role: <strong>${G.escapeHtml(G.roleLabel(a.run.role) || team.role)}</strong> · Progress: <strong>${a.run.progressPercent}%</strong>${a.run.assessment ? ` · Score: <strong>${a.run.assessment.totalScore}%</strong>` : ""}</div>` : ""}` ).join("") : `<div class="empty-state">No team mission assigned yet.</div>`}</div></div>
      </section>
      <section id="collaborationReportRoot" class="card" hidden></section>`;
    document.getElementById("copyCloneUrl")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(cloneUrl); G.toast("Clone URL copied.", "success"); } catch { G.toast("Could not copy the clone URL.", "error"); }
    });
    bindCollaborationActions();
    window.lucide?.createIcons?.();
  }

  async function renderTeamBuilder() {
    const candidateData = await G.api("/api/student/team/candidates");
    if (!candidateData.canCreate) {
      root.innerHTML = `<div class="card"><div class="empty-state">You already belong to a team. Refresh this page to load the current team.</div></div>`;
      return;
    }

    const candidates = candidateData.students || [];
    const candidateOptions = (selected = "") => candidates.map((student) => `
      <option value="${student.id}" ${student.id === selected ? "selected" : ""}>${G.escapeHtml(student.fullName)} · ${G.escapeHtml(student.universityId)} · ${student.xp} XP</option>`).join("");

    root.innerHTML = `
      <section class="team-builder-layout">
        <div class="card team-builder-card">
          <div class="card-head"><div><h3>Form your own team</h3><small>Create a three-person team now, or wait for an instructor to create one.</small></div></div>
          <div class="card-body">
            <form id="studentTeamForm">
              <div class="form-group"><label for="studentTeamName">Team name</label><input id="studentTeamName" required minlength="2" maxlength="80" placeholder="Example: Team Orbit"></div>
              <div class="team-form-row team-self-row"><div><strong>${G.escapeHtml(user.fullName || "You")}</strong><small>${G.escapeHtml(user.universityId || "Current student")}</small></div><select id="selfRole" required>${roleOptions("FEATURE_DEVELOPER")}</select></div>
              <div class="team-form-row"><select id="teammateOne" required><option value="">Choose teammate 1</option>${candidateOptions()}</select><select id="teammateOneRole" required>${roleOptions("TEST_DEVELOPER")}</select></div>
              <div class="team-form-row"><select id="teammateTwo" required><option value="">Choose teammate 2</option>${candidateOptions()}</select><select id="teammateTwoRole" required>${roleOptions("CODE_REVIEWER")}</select></div>
              <div class="form-message" role="status"></div>
              <div class="team-builder-actions"><button class="primary-action" type="submit"><i data-lucide="users-round"></i>Create team</button><a class="secondary-action" href="student-missions.html">Continue individual missions</a></div>
            </form>
          </div>
        </div>
        <div class="card"><div class="card-head"><h3>How team selection works</h3></div><div class="card-body team-guidance"><p>Use the XP leaderboard and mission performance to identify active students. Every team must have three different students and one unique role per member.</p><div class="role-guide"><span class="tag">Feature Developer</span><span class="tag">Test Developer</span><span class="tag">Code Reviewer</span></div><p class="rank-note">Instructors can also create teams and assign collaboration missions from their dashboard.</p></div></div>
      </section>`;

    const form = document.getElementById("studentTeamForm");
    const message = form.querySelector(".form-message");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.className = "form-message";
      message.textContent = "";
      const teammateOne = document.getElementById("teammateOne").value;
      const teammateTwo = document.getElementById("teammateTwo").value;
      const members = [
        { userId: user.id, teamRole: document.getElementById("selfRole").value },
        { userId: teammateOne, teamRole: document.getElementById("teammateOneRole").value },
        { userId: teammateTwo, teamRole: document.getElementById("teammateTwoRole").value }
      ];
      if (!teammateOne || !teammateTwo || teammateOne === teammateTwo) {
        message.className = "form-message error show";
        message.textContent = "Choose two different teammates.";
        return;
      }
      if (new Set(members.map((member) => member.teamRole)).size !== 3) {
        message.className = "form-message error show";
        message.textContent = "Each team role must be unique.";
        return;
      }
      try {
        await G.api("/api/student/team", {
          method: "POST",
          body: JSON.stringify({ name: document.getElementById("studentTeamName").value.trim(), members })
        });
        G.toast("Team created successfully.", "success");
        const { team } = await G.api("/api/student/team");
        renderExistingTeam(team);
      } catch (error) {
        message.className = "form-message error show";
        message.textContent = error.message;
      }
    });
    window.lucide?.createIcons?.();
  }

  try {
    const { team } = await G.api("/api/student/team");
    if (team) renderExistingTeam(team);
    else await renderTeamBuilder();
  } catch (error) {
    root.innerHTML = `<div class="card"><div class="empty-state">${G.escapeHtml(error.message)}</div></div>`;
  }
})();
