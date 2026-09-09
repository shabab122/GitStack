(async () => {
  "use strict";
  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;

  const grid = document.getElementById("missionGrid");
  const modal = document.getElementById("missionModal");
  const form = document.getElementById("missionForm");
  const fields = {
    id: document.getElementById("missionId"),
    title: document.getElementById("missionTitleInput"),
    slug: document.getElementById("missionSlugInput"),
    description: document.getElementById("missionDescriptionInput"),
    type: document.getElementById("missionTypeInput"),
    level: document.getElementById("missionLevelInput"),
    xp: document.getElementById("missionXpInput"),
    minutes: document.getElementById("missionMinutesInput"),
    objective: document.getElementById("missionObjectiveInput"),
    steps: document.getElementById("missionStepsInput"),
    published: document.getElementById("missionPublished"),
    repo: document.getElementById("ruleRepository"),
    requiredFile: document.getElementById("ruleRequiredFile"),
    tracked: document.getElementById("ruleTracked"),
    commits: document.getElementById("ruleCommits"),
    messageLength: document.getElementById("ruleMessageLength"),
    branchPrefix: document.getElementById("ruleBranchPrefix"),
    finishBranch: document.getElementById("ruleFinishBranch"),
    clean: document.getElementById("ruleClean")
  };
  const ruleBuilder = document.getElementById("ruleBuilder");
  let missions = [];
  let editingMission = null;

  function showMessage(message, kind = "error") {
    const el = form.querySelector(".form-message");
    el.className = `form-message ${kind} show`;
    el.textContent = message;
  }

  function clearMessage() {
    const el = form.querySelector(".form-message");
    el.className = "form-message";
    el.textContent = "";
  }

  function validationRulesFromForm() {
    const rules = {};
    if (fields.repo.checked) rules.repositoryInitialized = true;
    if (fields.requiredFile.value.trim()) rules.requiredFile = fields.requiredFile.value.trim();
    if (fields.tracked.checked) rules.fileMustBeTracked = true;
    const commits = Number(fields.commits.value || 0);
    if (commits > 0) rules.minimumCommits = commits;
    const messageLength = Number(fields.messageLength.value || 0);
    if (messageLength > 0) rules.minimumCommitMessageLength = messageLength;
    if (fields.branchPrefix.value.trim()) rules.requiredBranchPrefix = fields.branchPrefix.value.trim();
    if (fields.finishBranch.value.trim()) rules.finishOnBranch = fields.finishBranch.value.trim();
    if (fields.clean.checked) rules.cleanWorkingTree = true;
    return rules;
  }

  function setRuleBuilderState() {
    const isTeam = fields.type.value === "TEAM";
    ruleBuilder.classList.toggle("disabled-rules", isTeam);
    ruleBuilder.querySelectorAll("input").forEach((input) => { input.disabled = isTeam; });
  }

  function resetForm() {
    form.reset();
    editingMission = null;
    fields.id.value = "";
    fields.slug.disabled = false;
    fields.type.disabled = false;
    fields.slug.removeAttribute("title");
    fields.type.removeAttribute("title");
    fields.type.value = "INDIVIDUAL";
    fields.level.value = 1;
    fields.xp.value = 100;
    fields.minutes.value = 30;
    fields.repo.checked = true;
    fields.commits.value = 1;
    fields.messageLength.value = 8;
    fields.published.checked = false;
    clearMessage();
    setRuleBuilderState();
  }

  function openMission(mission = null) {
    resetForm();
    editingMission = mission;
    document.getElementById("missionModalTitle").textContent = mission ? "Edit mission" : "Create mission";
    if (mission) {
      const instructions = mission.instructions || {};
      const rules = mission.validationRules || {};
      fields.id.value = mission.id;
      fields.title.value = mission.title || "";
      fields.slug.value = mission.slug || "";
      fields.description.value = mission.description || "";
      fields.type.value = mission.missionType || "INDIVIDUAL";
      fields.level.value = mission.level || 1;
      fields.xp.value = mission.xpReward || 0;
      fields.minutes.value = mission.estimatedMinutes || "";
      fields.objective.value = instructions.objective || "";
      fields.steps.value = Array.isArray(instructions.steps) ? instructions.steps.join("\n") : "";
      fields.published.checked = Boolean(mission.isPublished);
      fields.repo.checked = Boolean(rules.repositoryInitialized);
      fields.requiredFile.value = rules.requiredFile || "";
      fields.tracked.checked = Boolean(rules.fileMustBeTracked);
      fields.commits.value = rules.minimumCommits || 0;
      fields.messageLength.value = rules.minimumCommitMessageLength || 0;
      fields.branchPrefix.value = rules.requiredBranchPrefix || "";
      fields.finishBranch.value = rules.finishOnBranch || "";
      fields.clean.checked = Boolean(rules.cleanWorkingTree);
      if (!mission.createdById) {
        fields.slug.disabled = true;
        fields.type.disabled = true;
        fields.slug.title = "Built-in mission slugs are locked because sandbox setup and validation depend on them.";
        fields.type.title = "Built-in mission types are locked to preserve their existing workflow.";
      }
      setRuleBuilderState();
    }
    modal.hidden = false;
    window.lucide?.createIcons?.();
    setTimeout(() => fields.title.focus(), 30);
  }

  function closeMission() {
    modal.hidden = true;
    resetForm();
  }

  function render() {
    if (!missions.length) {
      grid.innerHTML = `<div class="empty-state">No missions yet. Create the first mission from the instructor dashboard.</div>`;
      return;
    }

    grid.innerHTML = missions.map((mission) => {
      const sourceLabel = mission.createdBy ? `Created by ${G.escapeHtml(mission.createdBy.fullName)}` : "System mission";
      const validationCount = Object.keys(mission.validationRules || {}).length;
      return `
        <article class="mission-card">
          <div class="mission-card-top">
            <div class="mission-meta">
              <span class="tag ${mission.missionType === "TEAM" ? "blue" : "green"}">${G.escapeHtml(G.statusLabel(mission.missionType))}</span>
              <span class="tag dark">Level ${mission.level}</span>
            </div>
            <span class="status-chip ${mission.isPublished ? "active" : "draft"}">${mission.isPublished ? "PUBLISHED" : "DRAFT"}</span>
          </div>
          <h3>${G.escapeHtml(mission.title)}</h3>
          <p>${G.escapeHtml(mission.description)}</p>
          <div class="mission-source">${sourceLabel}</div>
          <div class="mission-meta" style="margin-top:15px">
            <span class="tag">${mission.xpReward} XP</span>
            <span class="tag">${mission.estimatedMinutes || "—"} min</span>
            <span class="tag">${validationCount} rules</span>
          </div>
          <div class="mini-stats">
            <div class="mini-stat"><strong>${mission.assignmentCount}</strong><span>Assigned</span></div>
            <div class="mini-stat"><strong>${mission.attemptCount}</strong><span>Attempts</span></div>
            <div class="mini-stat"><strong>${mission.completionPercent}%</strong><span>Completion</span></div>
          </div>
          ${mission.giteaRequired ? `<div class="notice info" style="margin-top:14px">Team mission assessment activates fully with the Gitea collaboration layer.</div>` : ""}
          <div class="mission-card-actions instructor-mission-actions">
            <a class="primary-action" href="instructor-assignments.html?mission=${encodeURIComponent(mission.id)}">Assign</a>
            ${mission.editable ? `<button class="secondary-action" type="button" data-edit-mission="${mission.id}">Edit</button>` : ""}
            ${mission.editable ? `<button class="ghost-action" type="button" data-publish-mission="${mission.id}">${mission.isPublished ? "Unpublish" : "Publish"}</button>` : ""}
            ${mission.deletable ? `<button class="danger-action" type="button" data-delete-mission="${mission.id}">Delete</button>` : ""}
          </div>
        </article>`;
    }).join("");

    grid.querySelectorAll("[data-edit-mission]").forEach((button) => button.addEventListener("click", () => {
      openMission(missions.find((mission) => mission.id === button.dataset.editMission));
    }));
    grid.querySelectorAll("[data-publish-mission]").forEach((button) => button.addEventListener("click", async () => {
      const mission = missions.find((item) => item.id === button.dataset.publishMission);
      if (!mission) return;
      try {
        await G.api(`/api/instructor/missions/${mission.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isPublished: !mission.isPublished })
        });
        G.toast(mission.isPublished ? "Mission unpublished." : "Mission published.", "success");
        await loadMissions();
      } catch (error) { G.toast(error.message, "error"); }
    }));
    grid.querySelectorAll("[data-delete-mission]").forEach((button) => button.addEventListener("click", async () => {
      const mission = missions.find((item) => item.id === button.dataset.deleteMission);
      if (!mission || !confirm(`Delete ${mission.title}? This is only allowed when there is no assignment or attempt history.`)) return;
      try {
        await G.api(`/api/instructor/missions/${mission.id}`, { method: "DELETE" });
        G.toast("Mission deleted.", "success");
        await loadMissions();
      } catch (error) { G.toast(error.message, "error"); }
    }));
    window.lucide?.createIcons?.();
  }

  async function loadMissions() {
    const data = await G.api("/api/instructor/missions");
    missions = data.missions;
    render();
  }

  document.getElementById("openMissionModal").addEventListener("click", () => openMission());
  document.querySelectorAll("[data-close-mission]").forEach((button) => button.addEventListener("click", closeMission));
  fields.type.addEventListener("change", setRuleBuilderState);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeMission(); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();
    const steps = fields.steps.value.split("\n").map((step) => step.trim()).filter(Boolean);
    const payload = {
      title: fields.title.value.trim(),
      slug: fields.slug.value.trim() || undefined,
      description: fields.description.value.trim(),
      missionType: fields.type.value,
      level: Number(fields.level.value),
      xpReward: Number(fields.xp.value),
      estimatedMinutes: fields.minutes.value ? Number(fields.minutes.value) : null,
      objective: fields.objective.value.trim(),
      steps,
      validationRules: fields.type.value === "TEAM" ? {} : validationRulesFromForm(),
      isPublished: fields.published.checked
    };
    if (!steps.length) return showMessage("Add at least one mission step.");
    if (fields.type.value === "INDIVIDUAL" && !Object.keys(payload.validationRules).length) {
      return showMessage("Choose at least one automatic validation rule for an individual mission.");
    }

    const id = fields.id.value;
    if (editingMission && !editingMission.createdById) {
      delete payload.slug;
      delete payload.missionType;
    }
    try {
      await G.api(id ? `/api/instructor/missions/${id}` : "/api/instructor/missions", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      G.toast(id ? "Mission updated." : "Mission created.", "success");
      closeMission();
      await loadMissions();
    } catch (error) {
      showMessage(error.message);
    }
  });

  try {
    await loadMissions();
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">${G.escapeHtml(error.message)}</div>`;
  }
})();
