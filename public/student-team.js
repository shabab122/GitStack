(async () => {
  "use strict";
  const G = window.GitStackStudent;
  const user = await G.ensureStudent();
  if (!user) return;
  const root = document.getElementById("teamRoot");
  const roles = ["FEATURE_DEVELOPER", "TEST_DEVELOPER", "CODE_REVIEWER"];

  function roleOptions(selected = "") {
    return roles.map((role) => `<option value="${role}" ${role === selected ? "selected" : ""}>${G.escapeHtml(G.roleLabel(role))}</option>`).join("");
  }

  function renderExistingTeam(team) {
    root.innerHTML = `
      <section class="page-intro" style="margin-top:-10px"><div><div class="mission-meta"><span class="tag">${G.escapeHtml(G.roleLabel(team.role) || "Member")}</span></div><h2>${G.escapeHtml(team.name)}</h2><p>Your three-person team is ready for instructor assignments and the upcoming Gitea collaboration workflow.</p></div></section>
      <section class="team-layout">
        <div class="card"><div class="card-head"><h3>Team members</h3></div><div class="card-body">${team.members.map((member) => `
          <div class="team-member"><div class="member-left"><span class="avatar">${G.escapeHtml((member.fullName || "?")[0])}</span><div><strong>${G.escapeHtml(member.fullName)}</strong><small>${G.escapeHtml(member.universityId)} • ${G.escapeHtml(G.roleLabel(member.teamRole) || "Role pending")}</small></div></div><span class="tag">${member.xp} XP</span></div>`).join("")}</div></div>
        <div class="card"><div class="card-head"><h3>Assignments</h3></div><div class="card-body">${team.assignments.length ? team.assignments.map((a) => `
          <div class="history-row"><div><strong>${G.escapeHtml(a.mission.title)}</strong><small>${G.escapeHtml(a.mission.description)}</small></div><span class="status-chip ${G.statusClass(a.status)}">${G.statusLabel(a.status)}</span></div>`).join("") : `<div class="empty-state">No team mission assigned yet.</div>`}</div></div>
      </section>`;
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
