(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;
  const grid = document.getElementById("studentGrid");
  const search = document.getElementById("studentSearch");
  const department = document.getElementById("departmentFilter");
  const semester = document.getElementById("semesterFilter");
  let students = [];
  let ranking = new Map();

  function render() {
    const query = search.value.trim().toLowerCase();
    const dep = department.value;
    const sem = semester.value;
    const filtered = students.filter((student) => {
      const hay = `${student.fullName} ${student.email} ${student.universityId}`.toLowerCase();
      return (!query || hay.includes(query)) && (!dep || student.department === dep) && (!sem || student.semester === sem);
    });
    document.getElementById("studentCount").textContent = `${filtered.length} student${filtered.length === 1 ? "" : "s"}`;
    grid.innerHTML = filtered.length ? filtered.map((student) => `
      <article class="student-card">
        <div class="student-card-top"><div style="display:flex;gap:11px"><span class="avatar">${G.escapeHtml((student.fullName || "?")[0])}</span><div><h3 style="margin:2px 0 3px">${G.escapeHtml(student.fullName)}</h3><p>${G.escapeHtml(student.universityId)} • ${G.escapeHtml(student.department || "—")}</p></div></div><span class="status-chip ${student.isActive ? "active" : "closed"}">${student.isActive ? "ACTIVE" : "INACTIVE"}</span></div>
        <div class="mini-stats"><div class="mini-stat"><strong>${ranking.get(student.id)?.rank ? `#${ranking.get(student.id).rank}` : "—"}</strong><span>XP Rank</span></div><div class="mini-stat"><strong>${student.xp}</strong><span>XP</span></div><div class="mini-stat"><strong>${ranking.get(student.id)?.contributionScore ?? 0}</strong><span>Contrib.</span></div></div>
        <div style="margin-top:13px"><div class="mission-meta">${student.team ? `<span class="tag green">${G.escapeHtml(student.team.name)}</span><span class="tag">${G.escapeHtml(G.roleLabel(student.team.role))}</span>` : `<span class="tag dark">No team</span>`}</div></div>
        <div style="display:flex;gap:8px;margin-top:15px"><a class="primary-action" href="instructor-student.html?id=${encodeURIComponent(student.id)}">View progress</a><a class="secondary-action" href="instructor-assignments.html?student=${encodeURIComponent(student.id)}">Assign</a></div>
      </article>`).join("") : `<div class="empty-state">No students match these filters.</div>`;
    window.lucide?.createIcons?.();
  }

  try {
    const [data, leaderboard] = await Promise.all([
      G.api("/api/instructor/students"),
      G.api("/api/instructor/leaderboard")
    ]);
    students = data.students;
    ranking = new Map((leaderboard.xpLeaderboard || []).map((row) => [row.id, row]));
    const deps = [...new Set(students.map((s) => s.department).filter(Boolean))].sort();
    const sems = [...new Set(students.map((s) => s.semester).filter(Boolean))].sort();
    department.insertAdjacentHTML("beforeend", deps.map((value) => `<option>${G.escapeHtml(value)}</option>`).join(""));
    semester.insertAdjacentHTML("beforeend", sems.map((value) => `<option>${G.escapeHtml(value)}</option>`).join(""));
    [search, department, semester].forEach((input) => input.addEventListener("input", render));
    render();
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">${G.escapeHtml(error.message)}</div>`;
  }
})();
