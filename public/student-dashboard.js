(async () => {
  "use strict";
  const G = window.GitStackStudent;
  const user = await G.ensureStudent();
  if (!user) return;
  document.querySelector("[data-student-first-name]").textContent = (user.fullName || "Student").split(/\s+/)[0];

  try {
    const data = await G.api("/api/student/dashboard");
    document.querySelectorAll("[data-student-xp]").forEach((el) => { el.textContent = `${data.xp.total} XP`; });
    const stats = [
      ["sparkles", data.xp.total, "Total XP", `Level ${data.xp.level}`],
      ["badge-check", data.statistics.completedMissions, "Missions completed", `${data.statistics.completionPercent}% complete`],
      ["timer", data.statistics.inProgressMissions, "In progress", data.activeRun ? data.activeRun.mission.title : "No active mission"],
      ["map", data.statistics.totalMissions, "Individual missions", "Practice at your pace"]
    ];
    document.getElementById("dashboardStats").innerHTML = stats.map(([icon,value,label,foot],index) => `
      <article class="stat-card"><div class="stat-top"><span class="stat-icon ${index===1?'green':index===2?'yellow':index===3?'dark':''}"><i data-lucide="${icon}"></i></span></div><strong>${G.escapeHtml(value)}</strong><span>${G.escapeHtml(label)}</span><div class="stat-foot">${G.escapeHtml(foot)}</div></article>`).join("");

    const activeCard = document.getElementById("activeMissionCard");
    if (data.activeRun) {
      const run = data.activeRun;
      activeCard.querySelector(".card-body").innerHTML = `
        <div class="mission-meta"><span class="tag">Level ${run.mission.level}</span><span class="tag">${run.mission.xpReward} XP</span></div>
        <h2 style="margin:14px 0 8px">${G.escapeHtml(run.mission.title)}</h2>
        <p>${G.escapeHtml(run.mission.description)}</p>
        <div class="progress-label"><span>Mission progress</span><strong>${run.progressPercent}%</strong></div>
        <div class="progress-track"><span style="width:${Math.max(0,Math.min(100,run.progressPercent))}%"></span></div>
        <div style="margin-top:18px"><a class="primary-action" href="student-mission.html?run=${encodeURIComponent(run.id)}">Continue mission</a></div>`;
    } else {
      activeCard.querySelector(".card-body").innerHTML = `<div class="empty-state"><i data-lucide="flag"></i><h3>No active mission</h3><p>Choose your next Git mission and start a fresh sandbox.</p><a class="primary-action" href="student-missions.html">Browse missions</a></div>`;
    }

    const recent = document.getElementById("recentRuns");
    recent.innerHTML = data.recentRuns.length ? data.recentRuns.map((run) => `
      <div class="history-row"><div><strong>${G.escapeHtml(run.mission.title)}</strong><small>Attempt ${run.attemptNumber} • ${G.formatDate(run.updatedAt)}</small></div><span class="status-chip ${G.statusClass(run.status)}">${G.statusLabel(run.status)}</span></div>`).join("") : `<div class="empty-state">No mission activity yet.</div>`;


    const assigned = document.getElementById("assignedMissions");
    assigned.innerHTML = data.assignments?.length ? data.assignments.map((assignment) => `
      <div class="history-row"><div><strong>${G.escapeHtml(assignment.mission.title)}</strong><small>Assigned by ${G.escapeHtml(assignment.assignedBy)}${assignment.dueAt ? ` • Due ${G.formatDate(assignment.dueAt)}` : ""}</small></div><a class="secondary-action" href="student-missions.html" style="padding:7px 10px">Open</a></div>`).join("") : `<div class="empty-state">No individual mission assigned by an instructor yet.</div>`;

    const team = document.getElementById("teamSummary");
    team.innerHTML = data.team ? `<div class="mission-meta"><span class="tag">${G.escapeHtml(data.team.role || "Member")}</span></div><h3 style="margin:12px 0 6px">${G.escapeHtml(data.team.name)}</h3><p style="color:var(--sd-muted)">${data.team.assignments.length ? `${data.team.assignments.length} active assignment(s).` : "No active team mission yet."}</p><a class="secondary-action" href="student-team.html">Open team area</a>` : `<div class="empty-state"><i data-lucide="users"></i><p>You have not been assigned to a team yet.</p></div>`;

    try {
      const leaderboard = await G.api("/api/student/leaderboard");
      const current = leaderboard.currentStudent;
      const milestone = current?.milestone;
      const milestoneMarkup = milestone
        ? `<span class="milestone-badge milestone-${milestone.key.toLowerCase()}"><i data-lucide="${milestone.icon}"></i>${G.escapeHtml(milestone.label)}</span>`
        : `<span class="milestone-badge milestone-none">Top 5 milestone not reached yet</span>`;
      document.getElementById("studentLeaderboard").innerHTML = `
        <div class="leaderboard-summary">
          <div><span>Your XP rank</span><strong>#${current?.rank || "—"}</strong></div>
          <div><span>Your milestone</span>${milestoneMarkup}</div>
          <div><span>Completed missions</span><strong>${current?.completedMissions ?? 0}</strong></div>
        </div>
        <div class="leaderboard-table-wrap"><table class="leaderboard-table"><thead><tr><th>#</th><th>Student</th><th>Milestone</th><th>XP</th></tr></thead><tbody>
        ${leaderboard.xpLeaderboard.map((row) => `<tr class="${row.id === user.id ? "is-current" : ""}"><td><strong>${row.rank}</strong></td><td><span class="leaderboard-name">${G.escapeHtml(row.fullName)}</span><small>${G.escapeHtml(row.universityId)}</small></td><td>${row.milestone ? `<span class="milestone-badge milestone-${row.milestone.key.toLowerCase()}"><i data-lucide="${row.milestone.icon}"></i>${G.escapeHtml(row.milestone.label)}</span>` : `<span class="rank-muted">—</span>`}</td><td class="xp-cell">${row.xp}</td></tr>`).join("")}
        </tbody></table></div>`;
    } catch (leaderboardError) {
      document.getElementById("studentLeaderboard").innerHTML = `<div class="empty-state">Leaderboard unavailable: ${G.escapeHtml(leaderboardError.message)}</div>`;
    }
    window.lucide?.createIcons?.();
  } catch (error) {
    G.toast(error.message, "error");
  }
})();
