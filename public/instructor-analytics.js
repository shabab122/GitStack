(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;
  try {
    const data = await G.api("/api/instructor/analytics");
    const stats = [
      ["users", data.overview.students, "Registered students", `${data.overview.studentsInTeams} placed in teams`, ""],
      ["sparkles", data.overview.averageXp, "Average XP", "Across all students", "green"],
      ["scan-search", `${data.overview.averageScore}%`, "Average score", `${data.overview.passRate}% pass rate`, "blue"],
      ["users-round", data.overview.teams, "Teams", "Three-person collaboration groups", "purple"]
    ];
    document.getElementById("analyticsStats").innerHTML = stats.map(([icon,value,label,foot,tone]) => `<article class="stat-card"><span class="stat-icon ${tone}"><i data-lucide="${icon}"></i></span><strong>${G.escapeHtml(value)}</strong><span>${G.escapeHtml(label)}</span><div class="stat-foot">${G.escapeHtml(foot)}</div></article>`).join("");

    document.getElementById("missionPerformance").innerHTML = data.missionPerformance.map((mission) => `<tr><td><strong>${G.escapeHtml(mission.title)}</strong></td><td>${G.escapeHtml(G.statusLabel(mission.missionType))}</td><td>${mission.attempts}</td><td>${mission.completed}</td><td>${mission.completionPercent}%</td><td>${mission.averageScore === null ? "—" : `${mission.averageScore}%`}</td></tr>`).join("") || `<tr><td colspan="6">No mission data yet.</td></tr>`;

    const maxBand = Math.max(1, ...data.xpBands.map((band) => band.count));
    document.getElementById("xpBands").innerHTML = data.xpBands.map((band) => `<div class="bar-row"><span>${G.escapeHtml(band.label)}</span><div class="bar-track green"><span style="width:${Math.round((band.count/maxBand)*100)}%"></span></div><strong>${band.count}</strong></div>`).join("");

    document.getElementById("analyticsMistakes").innerHTML = data.commonMistakes.length ? data.commonMistakes.map((item) => `<div class="mistake-row"><strong>${G.escapeHtml(item.label)}</strong><b>${item.count}</b></div>`).join("") : `<div class="empty-state">No failed assessment checks yet.</div>`;
    window.lucide?.createIcons?.();
  } catch (error) {
    G.toast(error.message, "error");
  }
})();
