(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;
  const tbody = document.getElementById("assessmentTable");
  const search = document.getElementById("assessmentSearch");
  const filter = document.getElementById("assessmentFilter");
  let assessments = [];

  function failedChecks(result) {
    const rules = Array.isArray(result.ruleResults) ? result.ruleResults : [];
    return rules.filter((rule) => rule?.passed === false).map((rule) => rule.label || rule.code).slice(0, 3);
  }
  function render() {
    const query = search.value.trim().toLowerCase();
    const mode = filter.value;
    const rows = assessments.filter((result) => {
      const hay = `${result.student?.fullName || ""} ${result.student?.universityId || ""} ${result.mission.title}`.toLowerCase();
      if (query && !hay.includes(query)) return false;
      if (mode === "passed" && !result.passed) return false;
      if (mode === "failed" && result.passed) return false;
      return true;
    });
    document.getElementById("assessmentCount").textContent = `${rows.length} result${rows.length === 1 ? "" : "s"}`;
    tbody.innerHTML = rows.length ? rows.map((result) => {
      const failed = failedChecks(result);
      return `<tr><td><strong>${G.escapeHtml(result.student?.fullName || "—")}</strong><br><small>${G.escapeHtml(result.student?.universityId || "")}</small></td><td>${G.escapeHtml(result.mission.title)}</td><td>${result.attemptNumber}</td><td><strong>${result.score}%</strong></td><td><span class="status-chip ${result.passed ? "passed" : "failed"}">${result.passed ? "PASSED" : "NEEDS WORK"}</span></td><td>${G.formatDate(result.assessedAt)}</td><td>${failed.length ? failed.map((item) => `<span class="tag" style="margin:2px">${G.escapeHtml(item)}</span>`).join("") : `<span class="tag green">All checks passed</span>`}</td></tr>`;
    }).join("") : `<tr><td colspan="7">No assessment results match this filter.</td></tr>`;
  }

  try {
    assessments = (await G.api("/api/instructor/assessments")).assessments;
    [search, filter].forEach((el) => el.addEventListener("input", render));
    render();
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7">${G.escapeHtml(error.message)}</td></tr>`;
  }
})();
