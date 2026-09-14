(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;
  const root = document.getElementById("activityList");
  function iconFor(type) {
    if (type.includes("STUDENT")) return "user-round-plus";
    if (type.includes("MISSION")) return "flag";
    if (type.includes("SANDBOX")) return "box";
    if (type.includes("ASSIGNMENT")) return "clipboard-check";
    return "activity";
  }
  async function load() {
    root.innerHTML = `<div class="empty-state">Loading activity…</div>`;
    try {
      const { activity } = await G.api("/api/instructor/activity");
      root.innerHTML = activity.length ? activity.map((item) => `<div class="activity-item"><span class="activity-icon"><i data-lucide="${iconFor(item.type)}"></i></span><div><strong>${G.escapeHtml(item.title)}</strong><small>${G.escapeHtml(item.detail)}</small></div><time>${G.formatDate(item.at)}</time></div>`).join("") : `<div class="empty-state">No activity yet.</div>`;
      window.lucide?.createIcons?.();
    } catch (error) { root.innerHTML = `<div class="empty-state">${G.escapeHtml(error.message)}</div>`; }
  }
  document.getElementById("refreshActivity").addEventListener("click", load);
  load();
})();
