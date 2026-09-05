(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;
  const grid = document.getElementById("missionGrid");
  try {
    const { missions } = await G.api("/api/instructor/missions");
    grid.innerHTML = missions.map((mission) => `
      <article class="mission-card">
        <div class="mission-card-top"><span class="tag ${mission.missionType === "TEAM" ? "blue" : "green"}">${G.escapeHtml(G.statusLabel(mission.missionType))}</span><span class="status-chip ${mission.isPublished ? "active" : "draft"}">${mission.isPublished ? "PUBLISHED" : "DRAFT"}</span></div>
        <h3>${G.escapeHtml(mission.title)}</h3><p>${G.escapeHtml(mission.description)}</p>
        <div class="mission-meta" style="margin-top:15px"><span class="tag">Level ${mission.level}</span><span class="tag">${mission.xpReward} XP</span><span class="tag">${mission.estimatedMinutes || "—"} min</span></div>
        <div class="mini-stats"><div class="mini-stat"><strong>${mission.assignmentCount}</strong><span>Assigned</span></div><div class="mini-stat"><strong>${mission.attemptCount}</strong><span>Attempts</span></div><div class="mini-stat"><strong>${mission.completionPercent}%</strong><span>Completion</span></div></div>
        ${mission.giteaRequired ? `<div class="notice info" style="margin-top:14px">This collaborative mission is prepared for the next Gitea integration phase.</div>` : ""}
        <div style="display:flex;gap:8px;margin-top:15px"><a class="primary-action" href="instructor-assignments.html?mission=${encodeURIComponent(mission.id)}">Assign mission</a></div>
      </article>`).join("");
    window.lucide?.createIcons?.();
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">${G.escapeHtml(error.message)}</div>`;
  }
})();
