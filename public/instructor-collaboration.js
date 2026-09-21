(async () => {
  "use strict";

  const G = window.GitStackInstructor;
  if (!await G.ensureInstructor()) return;

  const elements = {
    select: document.getElementById("collaborationAssignment"),
    summary: document.getElementById("collaborationSummary"),
    workflow: document.getElementById("collaborationWorkflow"),
    members: document.getElementById("collaborationMembers"),
    teamChecks: document.getElementById("collaborationTeamChecks"),
    timeline: document.getElementById("collaborationTimeline"),
    timelineMeta: document.getElementById("collaborationTimelineMeta"),
    eventFilter: document.getElementById("collaborationEventFilter"),
    sync: document.getElementById("collaborationSyncStatus"),
    connection: document.getElementById("giteaConnectionStatus"),
    message: document.getElementById("collaborationActionMessage"),
    prepare: document.getElementById("prepareCollaboration"),
    assess: document.getElementById("assessCollaboration"),
    refresh: document.getElementById("refreshCollaboration")
  };

  const requestedAssignmentId = new URLSearchParams(window.location.search).get("assignment");
  const eventIcons = {
    ISSUE: "circle-dot",
    BRANCH: "git-branch",
    COMMIT: "git-commit-horizontal",
    PUSH: "upload-cloud",
    PULL_REQUEST: "git-pull-request",
    REVIEW: "message-square-text",
    CHANGES_REQUESTED: "message-square-warning",
    TEST: "flask-conical",
    APPROVAL: "badge-check",
    MERGE: "git-merge",
    CONFLICT_RESOLUTION: "shield-check"
  };

  let assignments = [];
  let currentReport = null;
  let connectionState = null;
  let reportRequest = 0;
  let actionBusy = false;
  let refreshTimer = null;
  let currentStateVersion = "";

  function eventLabel(type) {
    return String(type || "EVENT").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function safeExternalUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function selectedAssignment() {
    return assignments.find((assignment) => assignment.id === elements.select.value) || null;
  }

  function setActionMessage(message = "", kind = "info") {
    elements.message.textContent = message;
    elements.message.className = `collaboration-action-message${message ? ` show ${kind}` : ""}`;
  }

  function setButtonLabel(button, label, icon) {
    button.innerHTML = `<i data-lucide="${icon}"></i><span>${G.escapeHtml(label)}</span>`;
  }

  function renderSyncStatus(report, { checking = false, error = "" } = {}) {
    if (!elements.sync) return;
    if (error) {
      elements.sync.className = "collaboration-sync-status error";
      elements.sync.textContent = `Live sync paused: ${error}`;
      return;
    }
    if (checking) {
      elements.sync.className = "collaboration-sync-status checking";
      elements.sync.textContent = "Checking shared workflow…";
      return;
    }
    elements.sync.className = "collaboration-sync-status live";
    elements.sync.textContent = report?.sync?.updatedAt
      ? `Live · synchronized ${G.formatDate(report.sync.updatedAt)}`
      : "Live shared workflow";
  }

  function updateControls() {
    const assignment = selectedAssignment();
    const connected = Boolean(connectionState?.connected);
    const currentStatus = currentReport?.assignment?.status || assignment?.status;
    const active = currentStatus === "ACTIVE";
    const assessable = ["ACTIVE", "CLOSED"].includes(currentStatus);
    const prepared = Boolean(currentReport?.assignment?.preparedAt || assignment?.collaboration?.prepared);
    elements.prepare.disabled = actionBusy || !assignment || !connected || !active;
    elements.assess.disabled = actionBusy || !assignment || !connected || !assessable || !prepared;
    elements.refresh.disabled = actionBusy;
  }

  function renderConnection(data) {
    const connected = Boolean(data?.connected);
    const organizationReady = Boolean(data?.organizationReady);
    const ready = connected && organizationReady;
    const kind = ready ? "ready" : connected ? "warning" : "error";
    const title = ready
      ? "Gitea collaboration service is ready"
      : connected
        ? "Gitea is connected, but the organization needs setup"
        : "Gitea collaboration service is unavailable";
    const detail = ready
      ? `Organization: ${data.organization || "gitstack"} · signed webhook workflow available`
      : connected
        ? "Open Gitea management and set up the GitStack organization before preparing a workspace."
        : data?.error || "Check GITEA_BASE_URL, GITEA_ADMIN_TOKEN and the running Gitea container.";
    elements.connection.className = `collaboration-health ${kind}`;
    elements.connection.innerHTML = `<span class="collaboration-health-icon"><i data-lucide="${ready ? "circle-check" : connected ? "triangle-alert" : "circle-x"}"></i></span><div><strong>${G.escapeHtml(title)}</strong><span>${G.escapeHtml(detail)}</span></div><a href="instructor-gitea.html">Open Gitea management</a>`;
    window.lucide?.createIcons?.();
    updateControls();
  }

  async function loadConnection() {
    try {
      connectionState = await G.api("/api/gitea/status");
    } catch (error) {
      connectionState = { connected: false, error: error.message };
    }
    renderConnection(connectionState);
  }

  function readinessMarkup(readiness, report) {
    const items = [
      { label: "Workspace prepared", ready: readiness.prepared },
      { label: "Repository provisioned", ready: readiness.repositoryProvisioned },
      { label: "Signed webhook active", ready: readiness.webhookConfigured },
      { label: `${readiness.linkedMembers || 0}/${readiness.totalMembers || 3} Gitea accounts linked`, ready: readiness.linkedMembers === readiness.totalMembers }
    ];
    const memberById = new Map(report.team.members.map((member) => [member.userId, member]));
    const missingNames = (readiness.missingGiteaMembers || []).map((id) => memberById.get(id)?.fullName).filter(Boolean);
    return `${items.map((item) => `<div class="readiness-item ${item.ready ? "ready" : ""}"><i data-lucide="${item.ready ? "circle-check" : "circle-alert"}"></i><span>${G.escapeHtml(item.label)}</span></div>`).join("")}${missingNames.length ? `<div class="notice" style="grid-column:1/-1"><strong>Access action required:</strong> ${G.escapeHtml(missingNames.join(", "))} must save an exact Gitea username on the Student Profile page, then the instructor should repair the workspace.</div>` : ""}`;
  }

  function renderSummary(report) {
    const repository = report.team.repository;
    const repositoryUrl = safeExternalUrl(repository?.url);
    const issueUrl = safeExternalUrl(report.assignment.issueUrl);
    const readiness = report.readiness || {};
    const teamScore = report.teamAssessment?.teamScore ?? 0;
    const workflowPercent = report.workflow?.percent ?? 0;
    const stats = report.stats || {};
    const latestActivity = stats.lastEventAt ? G.formatDate(stats.lastEventAt) : "No activity yet";
    elements.summary.innerHTML = `
      <div class="card-head">
        <div class="collaboration-summary-title">
          <h3>${G.escapeHtml(report.team.name)} · ${G.escapeHtml(report.mission.title)}</h3>
          <small>${repository ? `${G.escapeHtml(repository.owner)}/${G.escapeHtml(repository.name)}` : "Repository not provisioned"}${report.assignment.preparedAt ? ` · Prepared ${G.formatDate(report.assignment.preparedAt)}` : ""}</small>
          <div class="collaboration-summary-links">
            ${repositoryUrl ? `<a target="_blank" rel="noopener" href="${G.escapeHtml(repositoryUrl)}"><i data-lucide="external-link"></i>Open repository</a>` : ""}
            ${issueUrl ? `<a target="_blank" rel="noopener" href="${G.escapeHtml(issueUrl)}"><i data-lucide="circle-dot"></i>Open mission issue #${report.assignment.issueNumber}</a>` : ""}
          </div>
        </div>
        <span class="status-chip ${G.statusClass(report.assignment.status)}">${G.escapeHtml(G.statusLabel(report.assignment.status))}</span>
      </div>
      <div class="card-body">
        <div class="collaboration-overview-grid">
          <div class="collaboration-metric"><strong>${workflowPercent}%</strong><span>Workflow evidence</span><small>${report.workflow?.completedSteps || 0}/${report.workflow?.totalSteps || 11} stages complete</small></div>
          <div class="collaboration-metric"><strong>${stats.totalEvents || 0}</strong><span>Recorded events</span><small>Signed or verified system evidence</small></div>
          <div class="collaboration-metric"><strong>${report.assignment.issueNumber ? `#${report.assignment.issueNumber}` : "—"}</strong><span>Mission issue</span><small>Both PRs must reference it</small></div>
          <div class="collaboration-metric"><strong>${stats.passedMembers || 0}/${stats.totalMembers || 3}</strong><span>Students passed</span><small>${stats.assessedMembers || 0} currently assessed</small></div>
          <div class="collaboration-metric"><strong>${teamScore}/30</strong><span>Team score</span><small>${G.escapeHtml(latestActivity)}</small></div>
        </div>
        <div class="readiness-strip">${readinessMarkup(readiness, report)}</div>
      </div>`;
  }

  function renderWorkflow(report) {
    const workflow = report.workflow || { steps: [], completedSteps: 0, totalSteps: 0, percent: 0, complete: false };
    elements.workflow.innerHTML = `
      <div class="card-head"><div><h3>Workflow evidence</h3><small>Issue → Branch → Commit → Push → PR → Review → Test → Merge</small></div><span class="status-chip ${workflow.complete ? "completed" : workflow.completedSteps ? "in_progress" : "not_started"}">${workflow.percent}% complete</span></div>
      <div class="card-body">
        <div class="workflow-progress-wrap"><div class="workflow-progress-track"><span style="width:${Math.max(0, Math.min(100, workflow.percent))}%"></span></div><strong>${workflow.completedSteps}/${workflow.totalSteps}</strong></div>
        <div class="workflow-step-grid">${workflow.steps.map((step, index) => `<div class="workflow-step ${step.completed ? "complete" : ""}"><span class="workflow-step-number">${step.completed ? "✓" : index + 1}</span><strong>${G.escapeHtml(step.label)}</strong><small>${step.count}/${step.required} evidence item${step.required === 1 ? "" : "s"}</small></div>`).join("")}</div>
      </div>`;
  }

  function ruleMarkup(rules) {
    if (!rules?.length) return `<div class="empty-state">No assessment evidence is available yet.</div>`;
    return `<div class="rule-list">${rules.map((rule) => `<div class="rule-item ${rule.passed ? "passed" : ""}"><span class="rule-icon"><i data-lucide="${rule.passed ? "check" : "minus"}"></i></span><div class="rule-copy"><strong>${G.escapeHtml(rule.label || rule.code)}</strong>${rule.details ? `<small>${G.escapeHtml(rule.details)}</small>` : ""}</div><span class="rule-score">${rule.earned ?? 0}/${rule.points ?? 0}</span></div>`).join("")}</div>`;
  }

  function renderMembers(report) {
    if (!report.team.members.length) {
      elements.members.innerHTML = `<tr><td colspan="7">This team has no members.</td></tr>`;
      return;
    }

    elements.members.innerHTML = report.team.members.map((member) => {
      const run = report.runs.find((item) => item.userId === member.userId);
      const assessment = run?.assessment;
      const individualRules = Array.isArray(assessment?.ruleResults?.individual) ? assessment.ruleResults.individual : [];
      const feedback = run?.feedback?.[0]?.message || "";
      const status = assessment?.passed ? "COMPLETED" : run?.status || "NOT_STARTED";
      const action = run?.nextAction?.label || "Start the assigned collaboration role.";
      const reviewFeedback = run?.reviewFeedback?.message || "";
      return `
        <tr>
          <td><strong>${G.escapeHtml(member.fullName)}</strong><br><small>${G.escapeHtml(member.universityId)}${member.giteaUsername ? ` · @${G.escapeHtml(member.giteaUsername)}` : " · Gitea not linked"}</small></td>
          <td>${G.escapeHtml(member.roleLabel)}</td>
          <td><span class="status-chip ${G.statusClass(status)}">${assessment ? (assessment.passed ? "Passed" : "Needs work") : G.statusLabel(status)}</span></td>
          <td class="member-next-action"><strong>${G.escapeHtml(action)}</strong>${run?.lastActivityAt ? `<small>Updated ${G.formatDate(run.lastActivityAt)}</small>` : ""}</td>
          <td>${assessment?.individualScore ?? 0}/70</td>
          <td>${assessment?.teamScore ?? 0}/30</td>
          <td><strong>${assessment?.totalScore ?? 0}%</strong></td>
        </tr>
        <tr class="role-evidence-row"><td colspan="7"><details><summary>${assessment ? "View role evidence and feedback" : "View live role state"}</summary>${ruleMarkup(individualRules)}${reviewFeedback ? `<div class="notice" style="margin-top:10px"><strong>Latest review feedback:</strong> ${G.escapeHtml(reviewFeedback)}</div>` : ""}${feedback ? `<div class="notice info" style="margin-top:10px"><strong>বাংলা feedback:</strong> ${G.escapeHtml(feedback)}</div>` : ""}</details></td></tr>`;
    }).join("");
  }

  function renderTeamChecks(report) {
    const assessment = report.teamAssessment;
    if (!assessment) {
      elements.teamChecks.innerHTML = `<div class="card-head"><div><h3>Team checks</h3><small>Shared 30-point workflow score.</small></div></div><div class="card-body"><div class="empty-state">Run the assessment to calculate the shared team checks.</div></div>`;
      return;
    }
    elements.teamChecks.innerHTML = `
      <div class="card-head"><div><h3>Team checks</h3><small>Last assessed ${G.formatDate(assessment.assessedAt)}</small></div><span class="status-chip ${assessment.workflowComplete ? "completed" : "in_progress"}">${assessment.workflowComplete ? "Complete" : "In progress"}</span></div>
      <div class="card-body"><div class="team-check-summary"><div><strong>Shared workflow score</strong><span>${assessment.testEvidenceOk ? "Test evidence verified" : "Test evidence incomplete"} · ${assessment.conflictResolved ? "Conflict verified" : "Conflict pending"}</span></div><b>${assessment.teamScore}/30</b></div>${ruleMarkup(assessment.rules)}</div>`;
  }

  function renderTimeline() {
    if (!currentReport) return;
    const filter = elements.eventFilter.value;
    const allEvents = currentReport.timeline || [];
    const visibleEvents = filter === "ALL" ? allEvents : allEvents.filter((event) => event.type === filter);
    const memberById = new Map(currentReport.team.members.map((member) => [member.userId, member]));
    elements.timelineMeta.textContent = `${visibleEvents.length} of ${allEvents.length} recorded event${allEvents.length === 1 ? "" : "s"}`;
    if (!visibleEvents.length) {
      elements.timeline.innerHTML = `<div class="empty-state">${allEvents.length ? "No events match this filter." : "No signed Gitea activity has been captured yet."}</div>`;
      return;
    }

    elements.timeline.innerHTML = `<div class="collaboration-event-list">${visibleEvents.map((event) => {
      const actor = memberById.get(event.actorUserId);
      const actorLabel = actor ? `${actor.fullName}${actor.giteaUsername ? ` (@${actor.giteaUsername})` : ""}` : "GitStack provisioning / repository state";
      const details = [actorLabel, event.branch, event.resourceId ? `${event.type === "ISSUE" || event.type.includes("REQUEST") ? "#" : ""}${event.resourceId}` : "", event.action, event.message].filter(Boolean).join(" · ");
      const success = ["TEST", "APPROVAL", "MERGE", "CONFLICT_RESOLUTION"].includes(event.type);
      return `<div class="collaboration-event"><span class="collaboration-event-icon ${success ? "success" : ""}"><i data-lucide="${eventIcons[event.type] || "activity"}"></i></span><div class="collaboration-event-copy"><strong>${G.escapeHtml(eventLabel(event.type))}</strong><small>${G.escapeHtml(details)}</small></div><div class="collaboration-event-meta"><time>${G.formatDate(event.occurredAt)}</time>${event.scoreValue ? `<span>${event.scoreValue} evidence pts</span>` : ""}</div></div>`;
    }).join("")}</div>`;
  }

  function renderReport(report) {
    currentReport = report;
    currentStateVersion = report.sync?.version || "";
    renderSummary(report);
    renderWorkflow(report);
    renderMembers(report);
    renderTeamChecks(report);
    renderTimeline();
    renderSyncStatus(report);
    updateControls();
    window.lucide?.createIcons?.();
  }

  function renderReportError(message) {
    currentReport = null;
    currentStateVersion = "";
    elements.summary.innerHTML = `<div class="card-body"><div class="empty-state"><strong>Collaboration report unavailable</strong><br>${G.escapeHtml(message)}</div></div>`;
    elements.workflow.innerHTML = `<div class="card-head"><h3>Workflow evidence</h3></div><div class="card-body"><div class="empty-state">Unable to load workflow evidence.</div></div>`;
    elements.members.innerHTML = `<tr><td colspan="7">Unable to load role results.</td></tr>`;
    elements.teamChecks.innerHTML = `<div class="card-head"><h3>Team checks</h3></div><div class="card-body"><div class="empty-state">Unable to load team checks.</div></div>`;
    elements.timeline.innerHTML = `<div class="empty-state">Unable to load the event timeline.</div>`;
    elements.timelineMeta.textContent = "Report unavailable";
    renderSyncStatus(null, { error: message });
    updateControls();
  }

  function renderNoAssignments() {
    currentReport = null;
    currentStateVersion = "";
    elements.summary.innerHTML = `<div class="card-body"><div class="empty-state"><strong>No team assignment is available.</strong><br>Create or activate a team mission from <a href="instructor-assignments.html">Assignments</a>, then return here.</div></div>`;
    elements.workflow.innerHTML = `<div class="card-head"><h3>Workflow evidence</h3></div><div class="card-body"><div class="empty-state">No workflow selected.</div></div>`;
    elements.members.innerHTML = `<tr><td colspan="7">No team assignment found.</td></tr>`;
    elements.teamChecks.innerHTML = `<div class="card-head"><h3>Team checks</h3></div><div class="card-body"><div class="empty-state">No team assignment found.</div></div>`;
    elements.timeline.innerHTML = `<div class="empty-state">No team assignment found.</div>`;
    elements.timelineMeta.textContent = "No report selected.";
    if (elements.sync) {
      elements.sync.className = "collaboration-sync-status";
      elements.sync.textContent = "Choose an assignment to start live sync";
    }
    updateControls();
  }

  async function loadReport(id = elements.select.value, { silent = false, force = false } = {}) {
    const requestId = ++reportRequest;
    if (!id) {
      renderNoAssignments();
      return;
    }

    if (!silent) {
      currentReport = null;
      updateControls();
      renderSyncStatus(null, { checking: true });
      elements.summary.innerHTML = `<div class="card-body"><div class="loading-skeleton"></div></div>`;
    }
    try {
      const { report } = await G.api(`/api/instructor/assignments/${encodeURIComponent(id)}/collaboration-report`);
      if (requestId !== reportRequest) return;
      if (silent && !force && report.sync?.version && report.sync.version === currentStateVersion) {
        renderSyncStatus(report);
        return report;
      }
      renderReport(report);
      return report;
    } catch (error) {
      if (requestId !== reportRequest) return;
      if (silent) renderSyncStatus(currentReport, { error: error.message });
      else renderReportError(error.message);
      throw error;
    }
  }

  async function loadAssignments({ preserveSelection = true } = {}) {
    const previous = preserveSelection ? elements.select.value : "";
    const data = await G.api("/api/instructor/assignments");
    assignments = (data.assignments || []).filter((assignment) => assignment.mission?.missionType === "TEAM");
    elements.select.innerHTML = `<option value="">Choose a team assignment</option>${assignments.map((assignment) => `<option value="${G.escapeHtml(assignment.id)}">${G.escapeHtml(assignment.team?.name || "Team")} · ${G.escapeHtml(assignment.mission.title)} · ${G.escapeHtml(G.statusLabel(assignment.status))}${assignment.collaboration?.prepared ? " · prepared" : ""}</option>`).join("")}`;

    const preferred = [previous, requestedAssignmentId, assignments.find((assignment) => assignment.status === "ACTIVE")?.id, assignments[0]?.id]
      .find((id) => id && assignments.some((assignment) => assignment.id === id));
    elements.select.value = preferred || "";
    if (!elements.select.value) {
      renderNoAssignments();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("assignment", elements.select.value);
    window.history.replaceState({}, "", url);
    await loadReport(elements.select.value);
  }

  async function runAction(button, busyLabel, icon, operation) {
    actionBusy = true;
    const original = button.querySelector("span")?.textContent || button.textContent.trim();
    setButtonLabel(button, busyLabel, "loader-circle");
    updateControls();
    setActionMessage();
    window.lucide?.createIcons?.();
    try {
      await operation();
    } finally {
      actionBusy = false;
      setButtonLabel(button, original, icon);
      updateControls();
      window.lucide?.createIcons?.();
    }
  }

  elements.select.addEventListener("change", async () => {
    setActionMessage();
    const url = new URL(window.location.href);
    if (elements.select.value) url.searchParams.set("assignment", elements.select.value);
    else url.searchParams.delete("assignment");
    window.history.replaceState({}, "", url);
    try { await loadReport(); } catch (error) { G.toast(error.message, "error"); }
  });

  elements.eventFilter.addEventListener("change", () => {
    renderTimeline();
    window.lucide?.createIcons?.();
  });

  elements.refresh.addEventListener("click", async () => {
    await runAction(elements.refresh, "Refreshing…", "refresh-cw", async () => {
      try {
        await Promise.all([loadConnection(), loadAssignments({ preserveSelection: true })]);
        setActionMessage("Collaboration data refreshed.", "success");
      } catch (error) {
        setActionMessage(error.message, "error");
        G.toast(error.message, "error");
      }
    });
  });

  elements.prepare.addEventListener("click", async () => {
    if (!elements.select.value) return G.toast("Choose a team assignment first.", "error");
    await runAction(elements.prepare, "Preparing…", "wrench", async () => {
      try {
        const data = await G.api(`/api/instructor/assignments/${encodeURIComponent(elements.select.value)}/prepare-collaboration`, { method: "POST" });
        const warnings = data.warnings || [];
        setActionMessage(warnings.length ? `Workspace prepared with action required: ${warnings.join(" ")}` : "Collaboration workspace prepared and verified.", warnings.length ? "info" : "success");
        G.toast(warnings.length ? "Workspace prepared; review the readiness warnings." : "Collaboration workspace prepared.", warnings.length ? "info" : "success");
        await Promise.all([loadConnection(), loadReport(elements.select.value)]);
      } catch (error) {
        setActionMessage(error.message, "error");
        G.toast(error.message, "error");
      }
    });
  });

  elements.assess.addEventListener("click", async () => {
    if (!elements.select.value) return G.toast("Choose a team assignment first.", "error");
    await runAction(elements.assess, "Assessing…", "scan-search", async () => {
      try {
        const data = await G.api(`/api/instructor/assignments/${encodeURIComponent(elements.select.value)}/assess-collaboration`, { method: "POST" });
        const passed = (data.report?.results || []).filter((result) => result.passed).length;
        const total = data.report?.results?.length || 3;
        setActionMessage(`Assessment complete: ${passed}/${total} students currently pass the full workflow.`, passed === total ? "success" : "info");
        G.toast("Collaboration assessment updated.", "success");
        await loadReport(elements.select.value);
      } catch (error) {
        setActionMessage(error.message, "error");
        G.toast(error.message, "error");
      }
    });
  });

  function startLiveRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.hidden || actionBusy || !elements.select.value) return;
      loadReport(elements.select.value, { silent: true }).catch(() => {});
    }, 15000);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !actionBusy && elements.select.value) {
      loadReport(elements.select.value, { silent: true, force: true }).catch(() => {});
    }
  });
  window.addEventListener("beforeunload", () => clearInterval(refreshTimer));

  try {
    await Promise.all([loadConnection(), loadAssignments({ preserveSelection: false })]);
  } catch (error) {
    renderReportError(error.message);
    G.toast(error.message, "error");
  }
  startLiveRefresh();
})();
