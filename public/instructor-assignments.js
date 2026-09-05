(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;
  const modal = document.getElementById("assignmentModal");
  const form = document.getElementById("assignmentForm");
  const missionSelect = document.getElementById("assignmentMission");
  const targetSelect = document.getElementById("assignmentTarget");
  const assignmentIdInput = document.getElementById("assignmentId");
  const statusFilter = document.getElementById("assignmentStatusFilter");
  const tbody = document.getElementById("assignmentTable");
  let assignments = [];
  let missions = [];
  let students = [];
  let teams = [];

  function showMessage(message, kind = "error") {
    const el = form.querySelector(".form-message");
    el.className = `form-message full ${kind} show`;
    el.textContent = message;
  }
  function clearMessage() {
    const el = form.querySelector(".form-message");
    el.className = "form-message full";
    el.textContent = "";
  }
  function toIso(value) {
    return value ? new Date(value).toISOString() : null;
  }
  function currentMission() {
    return missions.find((mission) => mission.id === missionSelect.value) || null;
  }
  function refreshTargets(preferred = null) {
    const mission = currentMission();
    const teamMission = mission?.missionType === "TEAM";
    document.getElementById("targetLabel").textContent = teamMission ? "Three-person team" : "Student";
    const list = teamMission ? teams : students;
    targetSelect.innerHTML = `<option value="">Choose ${teamMission ? "a team" : "a student"}</option>` + list.map((item) => `<option value="${G.escapeHtml(item.id)}">${G.escapeHtml(teamMission ? item.name : `${item.fullName} · ${item.universityId}`)}</option>`).join("");
    if (preferred && [...targetSelect.options].some((option) => option.value === preferred)) targetSelect.value = preferred;
  }
  function render() {
    const filter = statusFilter.value;
    const rows = assignments.filter((assignment) => !filter || assignment.status === filter);
    tbody.innerHTML = rows.length ? rows.map((assignment) => `
      <tr><td><strong>${G.escapeHtml(assignment.mission.title)}</strong><br><span class="tag ${assignment.mission.missionType === "TEAM" ? "blue" : "green"}">${G.statusLabel(assignment.mission.missionType)}</span></td><td>${assignment.student ? `${G.escapeHtml(assignment.student.fullName)}<br><small>${G.escapeHtml(assignment.student.universityId)}</small>` : G.escapeHtml(assignment.team?.name || "—")}</td><td><span class="status-chip ${G.statusClass(assignment.status)}">${G.statusLabel(assignment.status)}</span></td><td>${G.formatDateOnly(assignment.startsAt)}</td><td>${G.formatDateOnly(assignment.dueAt)}</td><td>${assignment.runCount ?? 0}</td><td><div class="table-actions">${assignment.status !== "ACTIVE" ? `<button data-status="ACTIVE" data-id="${assignment.id}">Activate</button>` : ""}${assignment.status !== "CLOSED" ? `<button data-status="CLOSED" data-id="${assignment.id}">Close</button>` : ""}<button data-edit="${assignment.id}">Edit</button><button class="danger" data-delete="${assignment.id}">Delete</button></div></td></tr>`).join("") : `<tr><td colspan="7">No assignments match this filter.</td></tr>`;
    tbody.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => updateAssignment(button.dataset.id, { status: button.dataset.status })));
    tbody.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openModal(assignments.find((item) => item.id === button.dataset.edit))));
    tbody.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteAssignment(button.dataset.delete)));
  }
  async function loadAssignments() {
    assignments = (await G.api("/api/instructor/assignments")).assignments;
    render();
  }
  async function updateAssignment(id, payload) {
    try {
      await G.api(`/api/instructor/assignments/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      G.toast("Assignment updated.", "success");
      await loadAssignments();
    } catch (error) { G.toast(error.message, "error"); }
  }
  async function deleteAssignment(id) {
    if (!confirm("Delete this assignment? Assignment history with mission runs cannot be deleted.")) return;
    try {
      await G.api(`/api/instructor/assignments/${id}`, { method: "DELETE" });
      G.toast("Assignment deleted.", "success");
      await loadAssignments();
    } catch (error) { G.toast(error.message, "error"); }
  }
  function localInput(value) {
    if (!value) return "";
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0,16);
  }
  function openModal(assignment = null) {
    clearMessage();
    form.reset();
    assignmentIdInput.value = assignment?.id || "";
    missionSelect.disabled = Boolean(assignment);
    targetSelect.disabled = Boolean(assignment);
    if (assignment) {
      missionSelect.value = assignment.mission.id;
      refreshTargets(assignment.student?.id || assignment.team?.id || null);
      form.elements.status.value = assignment.status;
      form.elements.startsAt.value = localInput(assignment.startsAt);
      form.elements.dueAt.value = localInput(assignment.dueAt);
    } else {
      refreshTargets();
    }
    modal.hidden = false; window.lucide?.createIcons?.();
  }
  function closeModal() { modal.hidden = true; form.reset(); assignmentIdInput.value = ""; missionSelect.disabled = false; targetSelect.disabled = false; }
  document.getElementById("openAssignmentModal").addEventListener("click", openModal);
  document.querySelectorAll("[data-close-assignment]").forEach((button) => button.addEventListener("click", closeModal));
  missionSelect.addEventListener("change", () => refreshTargets());
  statusFilter.addEventListener("change", render);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); clearMessage();
    const mission = currentMission();
    if (!mission) return showMessage("Choose a mission.");
    const fd = new FormData(form);
    const editingId = assignmentIdInput.value;
    try {
      if (editingId) {
        await G.api(`/api/instructor/assignments/${editingId}`, { method: "PATCH", body: JSON.stringify({
          status: fd.get("status"), startsAt: toIso(fd.get("startsAt")), dueAt: toIso(fd.get("dueAt"))
        }) });
        G.toast("Assignment updated successfully.", "success");
      } else {
        await G.api("/api/instructor/assignments", { method: "POST", body: JSON.stringify({
          missionTemplateId: mission.id,
          targetType: mission.missionType === "TEAM" ? "team" : "student",
          targetId: fd.get("targetId"), status: fd.get("status"),
          startsAt: toIso(fd.get("startsAt")), dueAt: toIso(fd.get("dueAt"))
        }) });
        G.toast("Mission assigned successfully.", "success");
      }
      closeModal(); await loadAssignments();
    } catch (error) { showMessage(error.message); }
  });

  try {
    const [missionData, studentData, teamData] = await Promise.all([G.api("/api/instructor/missions"), G.api("/api/instructor/students"), G.api("/api/instructor/teams")]);
    missions = missionData.missions.filter((mission) => mission.isPublished);
    students = studentData.students.filter((student) => student.isActive);
    teams = teamData.teams;
    missionSelect.innerHTML = `<option value="">Choose a mission</option>` + missions.map((mission) => `<option value="${mission.id}">${G.escapeHtml(mission.title)} · ${G.statusLabel(mission.missionType)}</option>`).join("");
    const params = new URLSearchParams(location.search);
    const preferredMission = params.get("mission");
    const preferredStudent = params.get("student");
    if (preferredMission && missions.some((mission) => mission.id === preferredMission)) missionSelect.value = preferredMission;
    else if (preferredStudent) {
      const firstIndividual = missions.find((mission) => mission.missionType === "INDIVIDUAL");
      if (firstIndividual) missionSelect.value = firstIndividual.id;
    }
    refreshTargets(preferredStudent);
    await loadAssignments();
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7">${G.escapeHtml(error.message)}</td></tr>`;
  }
})();
