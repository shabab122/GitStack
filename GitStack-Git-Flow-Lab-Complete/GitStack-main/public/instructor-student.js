(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;
  const root = document.getElementById("studentDetail");
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    root.innerHTML = `<div class="card"><div class="empty-state">Select a student from the Students page.</div></div>`;
    return;
  }
  try {
    const data = await G.api(`/api/instructor/students/${encodeURIComponent(id)}`);
    const student = data.student;
    document.getElementById("studentTitle").textContent = student.fullName;
    const completed = data.runs.filter((run) => run.status === "COMPLETED").length;
    const passed = data.runs.filter((run) => run.assessment?.passed).length;
    root.innerHTML = `
      <section class="stats-grid"><article class="stat-card"><span class="stat-icon"><i data-lucide="sparkles"></i></span><strong>${student.xp}</strong><span>Total XP</span><div class="stat-foot">Current reward total</div></article><article class="stat-card"><span class="stat-icon green"><i data-lucide="badge-check"></i></span><strong>${completed}</strong><span>Completed runs</span><div class="stat-foot">${data.runs.length} total attempts</div></article><article class="stat-card"><span class="stat-icon blue"><i data-lucide="scan-search"></i></span><strong>${passed}</strong><span>Passed assessments</span><div class="stat-foot">Repository-state validation</div></article><article class="stat-card"><span class="stat-icon purple"><i data-lucide="users-round"></i></span><strong>${student.team ? "1" : "0"}</strong><span>Team placement</span><div class="stat-foot">${G.escapeHtml(student.team?.name || "Not assigned")}</div></article></section>
      <section class="detail-grid">
        <div class="card"><div class="card-head"><h3>Mission history</h3><a href="instructor-assignments.html?student=${encodeURIComponent(student.id)}">Assign mission</a></div><div class="card-body history-list">${data.runs.length ? data.runs.map((run) => `<div class="history-row"><div><strong>${G.escapeHtml(run.mission.title)}</strong><small>Attempt ${run.attemptNumber} • ${G.formatDate(run.updatedAt)}${run.assessment ? ` • Score ${run.assessment.score}` : ""}</small></div><span class="status-chip ${G.statusClass(run.status)}">${G.statusLabel(run.status)}</span></div>`).join("") : `<div class="empty-state">No mission attempts yet.</div>`}</div></div>
        <div><div class="card"><div class="card-head"><h3>Student profile</h3></div><div class="card-body"><div class="profile-summary"><span class="avatar">${G.escapeHtml((student.fullName || "?")[0])}</span><div><strong>${G.escapeHtml(student.fullName)}</strong><p style="margin:4px 0;color:var(--id-muted);font-size:12px">${G.escapeHtml(student.email)}</p></div></div><div class="definition-list" style="margin-top:16px"><div class="definition-row"><span>University ID</span><strong>${G.escapeHtml(student.universityId)}</strong></div><div class="definition-row"><span>Department</span><strong>${G.escapeHtml(student.department || "—")}</strong></div><div class="definition-row"><span>Semester</span><strong>${G.escapeHtml(student.semester || "—")}</strong></div><div class="definition-row"><span>Team</span><strong>${G.escapeHtml(student.team?.name || "Not assigned")}</strong></div><div class="definition-row"><span>Last login</span><strong>${G.formatDate(student.lastLoginAt)}</strong></div></div></div></div>
        <div class="card" style="margin-top:16px"><div class="card-head"><h3>Instructor assignments</h3></div><div class="card-body history-list">${data.assignments.length ? data.assignments.map((a) => `<div class="history-row"><div><strong>${G.escapeHtml(a.mission.title)}</strong><small>${a.dueAt ? `Due ${G.formatDateOnly(a.dueAt)}` : "No due date"}</small></div><span class="status-chip ${G.statusClass(a.status)}">${G.statusLabel(a.status)}</span></div>`).join("") : `<div class="empty-state">No direct assignments yet.</div>`}</div></div></div>
      </section>`;
    window.lucide?.createIcons?.();
  } catch (error) {
    root.innerHTML = `<div class="card"><div class="empty-state">${G.escapeHtml(error.message)}</div></div>`;
  }
})();
