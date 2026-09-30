(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;

  const modal = document.getElementById("assignmentModal");
  const form = document.getElementById("assignmentForm");
  const missionSelect = document.getElementById("assignmentMission");
  const targetSelect = document.getElementById("assignmentTarget");
  const assignmentIdInput = document.getElementById("assignmentId");
  const statusSelect = form.elements.status;
  const statusFilter = document.getElementById("assignmentStatusFilter");
  const searchInput = document.getElementById("assignmentSearch");
  const tbody = document.getElementById("assignmentTable");
  const modalTitle = document.getElementById("assignmentModalTitle");
  const submitButton = document.getElementById("assignmentSubmit");

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

  function localInput(value) {
    if (!value) return "";
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
  }

  function currentMission() {
    return missions.find((mission) => mission.id === missionSelect.value) || null;
  }

  function targetText(assignment) {
    return assignment.student
      ? `${assignment.student.fullName} ${assignment.student.universityId}`
      : assignment.team?.name || "";
  }

  function scheduleLabel(assignment) {
    const labels = {
      OPEN: "Open now",
      SCHEDULED: "Scheduled",
      OVERDUE: "Past due",
      DRAFT: "Draft",
      CLOSED: "Closed"
    };
    return labels[assignment.scheduleState] || assignment.scheduleState || "—";
  }

  function refreshTargets(preferred = null) {
    const mission = currentMission();
    const teamMission = mission?.missionType === "TEAM";
    document.getElementById("targetLabel").textContent = teamMission ? "Three-person team" : "Student";
    document.getElementById("targetHelp").textContent = teamMission
      ? "Team missions can only be assigned to an eligible three-person team with unique roles."
      : "Individual missions are assigned directly to one active student.";

    const list = teamMission ? teams.filter((team) => team.members?.length === 3) : students;
    targetSelect.innerHTML = `<option value="">Choose ${teamMission ? "a team" : "a student"}</option>` + list.map((item) => (
      `<option value="${G.escapeHtml(item.id)}">${G.escapeHtml(teamMission ? `${item.name} · ${item.members.length} members` : `${item.fullName} · ${item.universityId}`)}</option>`
    )).join("");
    if (preferred && [...targetSelect.options].some((option) => option.value === preferred)) targetSelect.value = preferred;
  }

  function updateSummary() {
    const counts = assignments.reduce((acc, item) => {
      acc.all += 1;
      acc[item.status.toLowerCase()] += 1;
      if (item.collaboration?.prepared) acc.collaboration += 1;
      return acc;
    }, { all: 0, active: 0, draft: 0, closed: 0, collaboration: 0 });
    for (const [key, value] of Object.entries(counts)) {
      const el = document.querySelector(`[data-assignment-count="${key}"]`);
      if (el) el.textContent = String(value);
    }
  }

  function collaborationCell(assignment) {
    if (assignment.mission.missionType !== "TEAM") return `<span class="muted">Not required</span>`;
    if (assignment.collaboration?.prepared) {
      const issue = assignment.collaboration.issueUrl
        ? `<a target="_blank" rel="noopener" href="${G.escapeHtml(assignment.collaboration.issueUrl)}">Issue #${assignment.collaboration.issueNumber}</a>`
        : "Workspace ready";
      return `<span class="tag green">Prepared</span><br><small>${issue}</small>`;
    }
    if (assignment.status === "ACTIVE") return `<span class="tag">Setup pending</span><br><small>Use Prepare/Retry</small>`;
    return `<span class="tag dark">Not prepared</span>`;
  }

  function actionButtons(assignment) {
    const buttons = [];
    if (assignment.status === "DRAFT") buttons.push(`<button data-status="ACTIVE" data-id="${assignment.id}">Activate</button>`);
    if (assignment.status === "CLOSED") buttons.push(`<button data-status="ACTIVE" data-id="${assignment.id}">Reopen</button>`);
    if (assignment.status !== "CLOSED") buttons.push(`<button data-status="CLOSED" data-id="${assignment.id}">Close</button>`);
    if (assignment.collaboration?.canPrepare) buttons.push(`<button data-prepare="${assignment.id}">Prepare/Retry</button>`);
    if (assignment.team?.giteaRepositoryUrl) buttons.push(`<a class="table-action-link" target="_blank" rel="noopener" href="${G.escapeHtml(assignment.team.giteaRepositoryUrl)}">Repository</a>`);
    buttons.push(`<button data-edit="${assignment.id}">Edit</button>`);
    if (assignment.canDelete) buttons.push(`<button class="danger" data-delete="${assignment.id}">Delete</button>`);
    return buttons.join("");
  }

  function render() {
    const filter = statusFilter.value;
    const query = String(searchInput.value || "").trim().toLowerCase();
    const rows = assignments.filter((assignment) => {
      if (filter && assignment.status !== filter) return false;
      if (!query) return true;
      return `${assignment.mission.title} ${targetText(assignment)} ${assignment.status} ${assignment.scheduleState}`.toLowerCase().includes(query);
    });

    tbody.innerHTML = rows.length ? rows.map((assignment) => `
      <tr>
        <td><strong>${G.escapeHtml(assignment.mission.title)}</strong><br><span class="tag ${assignment.mission.missionType === "TEAM" ? "blue" : "green"}">${G.statusLabel(assignment.mission.missionType)}</span></td>
        <td>${assignment.student ? `${G.escapeHtml(assignment.student.fullName)}<br><small>${G.escapeHtml(assignment.student.universityId)}</small>` : `${G.escapeHtml(assignment.team?.name || "—")}<br><small>${assignment.team?.memberCount ?? 0} members</small>`}</td>
        <td><span class="status-chip ${G.statusClass(assignment.status)}">${G.statusLabel(assignment.status)}</span></td>
        <td><strong>${G.escapeHtml(scheduleLabel(assignment))}</strong><br><small>${assignment.startsAt ? `Starts ${G.formatDate(assignment.startsAt)}` : "Starts immediately"}</small></td>
        <td>${assignment.dueAt ? G.formatDate(assignment.dueAt) : "No deadline"}</td>
        <td>${collaborationCell(assignment)}</td>
        <td>${assignment.runCount ?? 0}</td>
        <td><div class="table-actions">${actionButtons(assignment)}</div></td>
      </tr>`).join("") : `<tr><td colspan="8">No assignments match this filter.</td></tr>`;

    tbody.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => updateAssignment(button.dataset.id, { status: button.dataset.status })));
    tbody.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openModal(assignments.find((item) => item.id === button.dataset.edit))));
    tbody.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteAssignment(button.dataset.delete)));
    tbody.querySelectorAll("[data-prepare]").forEach((button) => button.addEventListener("click", () => prepareCollaboration(button.dataset.prepare, button)));
    updateSummary();
  }

  async function loadAssignments() {
    assignments = (await G.api("/api/instructor/assignments")).assignments;
    render();
  }

  async function updateAssignment(id, payload) {
    try {
      const data = await G.api(`/api/instructor/assignments/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      G.toast(data.warning || data.message || "Assignment updated.", data.warning ? "error" : "success");
      await loadAssignments();
    } catch (error) {
      G.toast(error.message, "error");
    }
  }

  async function prepareCollaboration(id, button) {
    button.disabled = true;
    try {
      const data = await G.api(`/api/instructor/assignments/${id}/prepare-collaboration`, { method: "POST" });
      G.toast(data.message || "Collaboration workspace prepared.", "success");
      await loadAssignments();
    } catch (error) {
      G.toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function deleteAssignment(id) {
    if (!confirm("Delete this assignment? Only assignments without mission or collaboration history can be deleted.")) return;
    try {
      const data = await G.api(`/api/instructor/assignments/${id}`, { method: "DELETE" });
      G.toast(data.message || "Assignment deleted.", "success");
      await loadAssignments();
    } catch (error) {
      G.toast(error.message, "error");
    }
  }

  function openModal(assignment = null) {
    clearMessage();
    form.reset();
    assignmentIdInput.value = assignment?.id || "";
    missionSelect.disabled = Boolean(assignment);
    targetSelect.disabled = Boolean(assignment);
    modalTitle.textContent = assignment ? "Edit mission assignment" : "Create mission assignment";
    submitButton.textContent = assignment ? "Save changes" : "Create assignment";
    statusSelect.querySelector('option[value="CLOSED"]').disabled = !assignment;

    if (assignment) {
      missionSelect.value = assignment.mission.id;
      refreshTargets(assignment.student?.id || assignment.team?.id || null);
      statusSelect.value = assignment.status;
      form.elements.startsAt.value = localInput(assignment.startsAt);
      form.elements.dueAt.value = localInput(assignment.dueAt);
    } else {
      statusSelect.value = "ACTIVE";
      refreshTargets();
    }

    modal.hidden = false;
    window.lucide?.createIcons?.();
  }

  function closeModal() {
    modal.hidden = true;
    form.reset();
    assignmentIdInput.value = "";
    missionSelect.disabled = false;
    targetSelect.disabled = false;
    submitButton.disabled = false;
  }

  document.getElementById("openAssignmentModal").addEventListener("click", () => openModal());
  document.querySelectorAll("[data-close-assignment]").forEach((button) => button.addEventListener("click", closeModal));
  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.hidden) closeModal(); });
  missionSelect.addEventListener("change", () => refreshTargets());
  statusFilter.addEventListener("change", render);
  searchInput.addEventListener("input", render);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();
    const mission = currentMission();
    if (!mission) return showMessage("Choose a mission.");

    const fd = new FormData(form);
    const editingId = assignmentIdInput.value;
    if (!editingId && !fd.get("targetId")) return showMessage("Choose a student or team.");

    const startsAt = fd.get("startsAt");
    const dueAt = fd.get("dueAt");
    if (startsAt && dueAt && new Date(dueAt) <= new Date(startsAt)) {
      return showMessage("Due date must be after the start date.");
    }

    submitButton.disabled = true;
    submitButton.textContent = editingId ? "Saving…" : "Creating…";
    try {
      let data;
      if (editingId) {
        data = await G.api(`/api/instructor/assignments/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: fd.get("status"), startsAt: toIso(startsAt), dueAt: toIso(dueAt) })
        });
      } else {
        data = await G.api("/api/instructor/assignments", {
          method: "POST",
          body: JSON.stringify({
            missionTemplateId: mission.id,
            targetType: mission.missionType === "TEAM" ? "team" : "student",
            targetId: fd.get("targetId"),
            status: fd.get("status"),
            startsAt: toIso(startsAt),
            dueAt: toIso(dueAt)
          })
        });
      }
      closeModal();
      G.toast(data.warning || data.message || (editingId ? "Assignment updated successfully." : "Mission assigned successfully."), data.warning ? "error" : "success");
      await loadAssignments();
    } catch (error) {
      submitButton.disabled = false;
      submitButton.textContent = editingId ? "Save changes" : "Create assignment";
      showMessage(error.message);
    }
  });

  try {
    const [missionData, studentData, teamData] = await Promise.all([
      G.api("/api/instructor/missions"),
      G.api("/api/instructor/students"),
      G.api("/api/instructor/teams")
    ]);
    missions = missionData.missions.filter((mission) => mission.isPublished);
    students = studentData.students.filter((student) => student.isActive);
    teams = teamData.teams;
    missionSelect.innerHTML = `<option value="">Choose a mission</option>` + missions.map((mission) => (
      `<option value="${mission.id}">${G.escapeHtml(mission.title)} · ${G.statusLabel(mission.missionType)} · ${mission.xpReward} XP</option>`
    )).join("");

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
    tbody.innerHTML = `<tr><td colspan="8">${G.escapeHtml(error.message)}</td></tr>`;
  }
})();
