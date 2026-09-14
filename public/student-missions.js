(async () => {
  "use strict";
  const G = window.GitStackStudent;
  const user = await G.ensureStudent();
  if (!user) return;
  const grid = document.getElementById("missionGrid");

  async function startMission(slug, retry = false) {
    try {
      G.toast(retry ? "Creating a practice retry…" : "Starting mission…");
      const data = await G.api(`/api/student/missions/${encodeURIComponent(slug)}/start`, {
        method: "POST",
        body: JSON.stringify({ retry })
      });
      window.location.assign(`student-mission.html?run=${encodeURIComponent(data.run.id)}`);
    } catch (error) {
      G.toast(error.message, "error");
    }
  }

  try {
    const data = await G.api("/api/student/missions");
    grid.innerHTML = data.missions.map((mission) => {
      const status = mission.status;
      const team = mission.missionType === "team";
      const label = status === "IN_PROGRESS" ? "Continue" : status === "COMPLETED" ? "Practice again" : "Start mission";
      const icon = status === "COMPLETED" ? "badge-check" : status === "IN_PROGRESS" ? "play" : "flag";
      return `<article class="mission-card ${team?'locked':''}" data-slug="${G.escapeHtml(mission.slug)}">
        <div class="mission-card-top"><span class="mission-level">${mission.level}</span><span class="status-chip ${G.statusClass(status)}">${G.statusLabel(status)}</span></div>
        <h3>${G.escapeHtml(mission.title)}</h3><p>${G.escapeHtml(mission.description)}</p>
        <div class="mission-meta"><span class="tag"><i data-lucide="sparkles"></i>${mission.xpReward} XP</span><span class="tag"><i data-lucide="clock-3"></i>${mission.estimatedMinutes || '—'} min</span><span class="tag">${team?'Team':'Individual'}</span>${mission.assignment ? `<span class="tag"><i data-lucide="clipboard-check"></i>Assigned${mission.assignment.dueAt ? ` • due ${new Date(mission.assignment.dueAt).toLocaleDateString()}` : ""}</span>` : ""}</div>
        <div class="mission-card-actions">${team ? `<a class="secondary-action" href="student-team.html"><i data-lucide="users"></i>View team area</a>` : `<button class="primary-action" type="button" data-start="${G.escapeHtml(mission.slug)}" data-retry="${status==='COMPLETED'?'true':'false'}"><i data-lucide="${icon}"></i>${label}</button>${mission.latestRunId ? `<a class="secondary-action" href="student-mission.html?run=${encodeURIComponent(mission.latestRunId)}">Open details</a>`:''}`}</div>
      </article>`;
    }).join("");
    grid.querySelectorAll("[data-start]").forEach((button) => button.addEventListener("click", () => startMission(button.dataset.start, button.dataset.retry === "true")));
    window.lucide?.createIcons?.();
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">${G.escapeHtml(error.message)}</div>`;
  }
})();
