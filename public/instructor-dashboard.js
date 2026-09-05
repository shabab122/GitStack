(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  const user = await G.ensureInstructor();
  if (!user) return;
  document.querySelector("[data-instructor-first-name]").textContent = (user.fullName || "Instructor").split(/\s+/)[0];

  try {
    const data = await G.api("/api/instructor/dashboard");
    const stats = [
      ["users", data.statistics.students, "Students", `${data.statistics.averageXp} average XP`, ""],
      ["users-round", data.statistics.teams, "Teams", "Three-person collaboration groups", "green"],
      ["clipboard-check", data.statistics.activeAssignments, "Active assignments", `${data.statistics.missions} published missions`, "blue"],
      ["badge-check", `${data.statistics.completionPercent}%`, "Mission completion", `${data.statistics.averageScore}% average score`, "purple"]
    ];
    document.getElementById("dashboardStats").innerHTML = stats.map(([icon, value, label, foot, tone]) => `
      <article class="stat-card"><span class="stat-icon ${tone}"><i data-lucide="${icon}"></i></span><strong>${G.escapeHtml(value)}</strong><span>${G.escapeHtml(label)}</span><div class="stat-foot">${G.escapeHtml(foot)}</div></article>`).join("");

    document.getElementById("classProgress").innerHTML = `
      <div class="mission-meta"><span class="tag">${data.statistics.completedRuns} completed runs</span><span class="tag">${data.statistics.totalRuns} total attempts</span></div>
      <h2 style="font-size:34px;margin:18px 0 7px">${data.statistics.completionPercent}% completion</h2>
      <p>Current individual mission completion across registered students.</p>
      <div style="height:10px;background:#344744;border-radius:999px;overflow:hidden;margin-top:18px"><span style="display:block;width:${Math.min(100, data.statistics.completionPercent)}%;height:100%;background:linear-gradient(90deg,#ff6b35,#f6b04e)"></span></div>`;

    document.getElementById("recentActivity").innerHTML = data.recentActivity.length ? data.recentActivity.map((item) => `
      <div class="activity-item"><span class="activity-icon"><i data-lucide="activity"></i></span><div><strong>${G.escapeHtml(item.title)}</strong><small>${G.escapeHtml(item.detail)}</small></div><time>${G.formatDate(item.at)}</time></div>`).join("") : `<div class="empty-state">No student activity yet.</div>`;

    document.getElementById("commonMistakes").innerHTML = data.commonMistakes.length ? data.commonMistakes.map((item) => `
      <div class="mistake-row"><strong>${G.escapeHtml(item.label)}</strong><b>${item.count}</b></div>`).join("") : `<div class="empty-state">No failed assessment checks yet.</div>`;

    document.getElementById("recentAssignments").innerHTML = data.recentAssignments.length ? data.recentAssignments.map((assignment) => `
      <div class="history-row"><div><strong>${G.escapeHtml(assignment.mission.title)}</strong><small>${assignment.student ? G.escapeHtml(assignment.student.fullName) : G.escapeHtml(assignment.team?.name || "Team")} • ${assignment.dueAt ? `Due ${G.formatDateOnly(assignment.dueAt)}` : "No due date"}</small></div><span class="status-chip ${G.statusClass(assignment.status)}">${G.statusLabel(assignment.status)}</span></div>`).join("") : `<div class="empty-state">No mission assignments yet.</div>`;
    window.lucide?.createIcons?.();
  } catch (error) {
    G.toast(error.message, "error");
  }
})();
