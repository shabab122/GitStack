(async () => {
  "use strict";

  const G = window.GitStackStudent;
  const user = await G.ensureStudent();
  if (!user) return;

  const root = document.getElementById("teamRoot");
  const roles = ["FEATURE_DEVELOPER", "TEST_DEVELOPER", "CODE_REVIEWER"];
  const roleBranches = {
    FEATURE_DEVELOPER: "feature/login-improvement",
    TEST_DEVELOPER: "test/login-improvement",
    CODE_REVIEWER: "review/login-improvement"
  };
  const reports = new Map();
  let currentTeam = null;
  let refreshTimer = null;

  const roleGuides = {
    FEATURE_DEVELOPER: {
      summary: "Implement the feature in two meaningful commits, open the feature Pull Request, then respond with another commit after changes are requested.",
      steps: [
        "Confirm that the terminal is on feature/login-improvement.",
        "Change AUTH_MODE to secure-feature and enable FEATURE_FLAG in src/login-policy.txt.",
        "Create at least two meaningful commits and push the feature branch.",
        "Open a Pull Request to main and include the mission issue reference.",
        "After the Reviewer requests changes, make a real correction, commit it and push again."
      ],
      commands: [
        "cd /workspace/team-repo",
        "git branch --show-current",
        "sed -i 's/^AUTH_MODE=legacy$/AUTH_MODE=secure-feature/' src/login-policy.txt",
        "git add src/login-policy.txt && git commit -m \"Secure the login authentication mode\"",
        "sed -i 's/^FEATURE_FLAG=off$/FEATURE_FLAG=enabled/' src/login-policy.txt",
        "git add src/login-policy.txt && git commit -m \"Enable the login feature flag\"",
        "git push -u origin feature/login-improvement"
      ]
    },
    TEST_DEVELOPER: {
      summary: "Record the expected failing test, open the test Pull Request, then resolve the deliberate conflict after the feature branch is merged and record the passing test.",
      steps: [
        "Confirm that the terminal is on test/login-improvement.",
        "Change AUTH_MODE to secure-tested and enable TEST_GUARD in src/login-policy.txt.",
        "Run the verification script before resolution; it must fail. Record a meaningful FAIL: line.",
        "Commit, push and open a Pull Request to main with the mission issue reference.",
        "After the Feature PR is merged, merge origin/main, resolve the conflict to secure-verified, rerun the test and record a PASS: line before the final push."
      ],
      commands: [
        "cd /workspace/team-repo",
        "git branch --show-current",
        "sed -i 's/^AUTH_MODE=legacy$/AUTH_MODE=secure-tested/' src/login-policy.txt",
        "sed -i 's/^TEST_GUARD=off$/TEST_GUARD=enabled/' src/login-policy.txt",
        "sh tests/verify-login-policy.sh",
        "git add src/login-policy.txt tests/test-evidence.md",
        "git commit -m \"Add test guard and failing test evidence\"",
        "git push -u origin test/login-improvement"
      ]
    },
    CODE_REVIEWER: {
      summary: "Perform the review in Gitea using your own linked account. Request changes first, verify the revised feature and test evidence, then approve and merge in the required order.",
      steps: [
        "Open the feature Pull Request and submit a specific review comment of at least eight characters.",
        "Request changes on the Feature PR before approving anything.",
        "Wait for the Feature Developer's follow-up commit, then approve and merge the Feature PR first.",
        "Verify that the Test PR contains both FAIL and PASS evidence and the final conflict-free policy.",
        "Approve and merge the Test PR second. Never perform student actions with the instructor account."
      ],
      commands: []
    }
  };

  function roleOptions(selected = "") {
    return roles.map((role) => `<option value="${role}" ${role === selected ? "selected" : ""}>${G.escapeHtml(G.roleLabel(role))}</option>`).join("");
  }

  function eventLabel(type) {
    return String(type || "EVENT").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  }

  function assignmentElement(assignmentId) {
    return document.getElementById(`assignment-${assignmentId}`);
  }

  function guideFor(role) {
    return roleGuides[role] || {
      summary: "Complete the role-specific work described in COLLABORATION_MISSION.md.",
      steps: ["Open the mission brief, complete your assigned work and use your own Gitea account for every action."],
      commands: []
    };
  }

  function renderRoleGuide(role, issueNumber) {
    const guide = guideFor(role);
    const issueReference = issueNumber ? `Closes #${issueNumber}` : "Closes #<mission-issue>";
    return `<div class="student-role-guide">
      <div class="role-guide-heading"><div><span class="eyebrow">YOUR RESPONSIBILITY</span><h4>${G.escapeHtml(G.roleLabel(role))}</h4><p>${G.escapeHtml(guide.summary)}</p></div><code>${G.escapeHtml(roleBranches[role] || "role branch")}</code></div>
      <ol>${guide.steps.map((step) => `<li>${G.escapeHtml(step)}</li>`).join("")}</ol>
      ${guide.commands.length ? `<details><summary>Show safe starter commands</summary><div class="role-command-box"><button type="button" class="secondary-action compact-action" data-copy-role="${role}">Copy commands</button><pre>${G.escapeHtml(guide.commands.join("\n"))}</pre></div></details>` : `<div class="notice info">Reviewer work happens in the real Gitea Pull Request pages. A terminal push is not required for this role.</div>`}
      <div class="notice warning"><strong>Pull Request body:</strong> include <code>${G.escapeHtml(issueReference)}</code>. Use your own Gitea username and personal access token; never use the instructor token.</div>
    </div>`;
  }

  function renderWorkflow(workflow) {
    const steps = workflow?.steps || [];
    if (!steps.length) return `<div class="empty-state">Workflow evidence will appear after the collaboration workspace is prepared.</div>`;
    return `<div class="student-workflow-progress"><div class="workflow-progress-head"><strong>${workflow.percent || 0}% complete</strong><span>${workflow.completedSteps || 0}/${workflow.totalSteps || steps.length} stages</span></div><div class="workflow-progress-track"><span style="width:${Math.min(100, Math.max(0, workflow.percent || 0))}%"></span></div><div class="student-workflow-grid">${steps.map((step, index) => `<div class="student-workflow-step ${step.completed ? "complete" : "pending"}"><span>${step.completed ? "✓" : index + 1}</span><div><strong>${G.escapeHtml(step.label)}</strong><small>${step.count}/${step.required} evidence</small></div></div>`).join("")}</div></div>`;
  }

  function nextAction(report) {
    const run = report.myRun;
    const ruleResults = run?.assessment?.ruleResults || {};
    const roleRule = (Array.isArray(ruleResults.individual) ? ruleResults.individual : []).find((rule) => !rule.passed);
    if (roleRule) return roleRule.label || roleRule.code;
    const workflowStep = report.workflow?.steps?.find((step) => !step.completed);
    if (workflowStep) return `Help the team complete: ${workflowStep.label}`;
    if (run?.assessment?.passed) return "Completed — your role and the team workflow passed.";
    return guideFor(run?.role).steps[0];
  }

  function renderAssignmentSnapshot(report) {
    reports.set(report.assignment.id, report);
    const card = assignmentElement(report.assignment.id);
    if (!card) return;
    const run = report.myRun || {};
    const assessment = run.assessment || null;
    const workflow = report.workflow || {};
    const stats = report.stats || {};
    const stateTarget = card.querySelector("[data-assignment-state]");
    const workflowTarget = card.querySelector("[data-assignment-workflow]");
    const nextTarget = card.querySelector("[data-assignment-next]");
    const startButton = card.querySelector("[data-collab-start]");

    if (stateTarget) {
      stateTarget.innerHTML = `<div class="student-collab-stats">
        <div><strong>${workflow.percent || 0}%</strong><span>Workflow evidence</span></div>
        <div><strong>${stats.totalEvents || 0}</strong><span>Recorded events</span></div>
        <div><strong>${assessment ? `${assessment.totalScore}%` : "—"}</strong><span>Your score</span></div>
        <div><strong>${run.progressPercent || 0}%</strong><span>Your progress</span></div>
      </div>`;
    }
    if (workflowTarget) workflowTarget.innerHTML = renderWorkflow(workflow);
    if (nextTarget) nextTarget.innerHTML = `<strong>Next action</strong><span>${G.escapeHtml(nextAction(report))}</span>`;
    if (startButton && run.sandbox) startButton.innerHTML = `<i data-lucide="terminal-square"></i>Continue workspace`;
    window.lucide?.createIcons?.();
  }

  function renderCollaborationReport(report) {
    const target = document.getElementById("collaborationReportRoot");
    if (!target) return;
    const myRun = report.myRun || null;
    const assessment = myRun?.assessment || null;
    const rules = assessment?.ruleResults || {};
    const individualRules = Array.isArray(rules.individual) ? rules.individual : [];
    const teamRules = Array.isArray(rules.team) ? rules.team : [];
    const timeline = [...(report.timeline || [])].reverse().slice(0, 30);
    target.hidden = false;
    target.innerHTML = `<div class="card-head"><div><h3>Collaboration assessment</h3><small>${G.escapeHtml(report.mission?.title || "Team mission")}</small></div><span class="tag ${assessment?.passed ? "green" : "dark"}">${assessment ? `${assessment.totalScore}%` : "Not assessed"}</span></div><div class="card-body">
      <div class="gitea-repo-summary"><div><strong>Your role: ${G.escapeHtml(G.roleLabel(myRun?.role))}</strong><small>Individual ${assessment?.individualScore ?? 0}/70 · Team ${assessment?.teamScore ?? 0}/30 · Total ${assessment?.totalScore ?? 0}%</small></div></div>
      <div class="collaboration-rule-grid">${[...individualRules, ...teamRules].map((rule) => `<div class="detail-item ${rule.passed ? "rule-passed" : "rule-pending"}"><strong>${rule.passed ? "✓" : "○"} ${G.escapeHtml(rule.label || rule.code)}</strong><span>${rule.earned ?? 0}/${rule.points ?? 0}</span></div>`).join("") || `<div class="empty-state">Run “Check workflow” after your team starts working.</div>`}</div>
      <h4 class="report-section-title">Team workflow</h4>${renderWorkflow(report.workflow)}
      <h4 class="report-section-title">Latest Gitea activity</h4><div class="collaboration-timeline">${timeline.length ? timeline.map((event) => `<div class="history-row"><div><strong>${G.escapeHtml(eventLabel(event.type))}</strong><small>${event.branch ? G.escapeHtml(event.branch) : "Team repository"}${event.resourceId ? ` · #${G.escapeHtml(event.resourceId)}` : ""}</small></div><span>${G.formatDate(event.occurredAt)}</span></div>`).join("") : `<div class="empty-state">No signed Gitea events recorded yet. Push a branch or open a Pull Request to begin the timeline.</div>`}</div>
      ${myRun?.feedback?.[0]?.message ? `<div class="notice info report-feedback"><strong>বাংলা feedback:</strong> ${G.escapeHtml(myRun.feedback[0].message)}</div>` : ""}
    </div>`;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadCollaborationReport(assignmentId, { show = false, silent = false } = {}) {
    try {
      const { report } = await G.api(`/api/student/team/assignments/${assignmentId}/report`);
      renderAssignmentSnapshot(report);
      if (show) renderCollaborationReport(report);
      return report;
    } catch (error) {
      const card = assignmentElement(assignmentId);
      const workflowTarget = card?.querySelector("[data-assignment-workflow]");
      if (workflowTarget) workflowTarget.innerHTML = `<div class="notice warning">${G.escapeHtml(error.message)}</div>`;
      if (!silent) G.toast(error.message, "error");
      return null;
    }
  }

  async function refreshAllReports({ silent = true } = {}) {
    if (!currentTeam?.assignments?.length) return;
    const assignments = currentTeam.assignments.filter((assignment) => ["ACTIVE", "CLOSED"].includes(assignment.status));
    await Promise.all(assignments.map((assignment) => loadCollaborationReport(assignment.id, { silent })));
  }

  function assignmentCard(assignment, team) {
    const issueUrl = G.safeExternalUrl(assignment.issueUrl);
    const canStart = Boolean(team.currentStudentGiteaUsername && team.gitea);
    return `<section class="card collaboration-assignment-card" id="assignment-${G.escapeHtml(assignment.id)}">
      <div class="card-head"><div><div class="mission-meta"><span class="tag">${G.escapeHtml(G.roleLabel(team.role))}</span>${assignment.preparedAt ? `<span class="tag green">Prepared</span>` : `<span class="tag dark">Waiting for preparation</span>`}</div><h3>${G.escapeHtml(assignment.mission.title)}</h3><small>${G.escapeHtml(assignment.mission.description)}</small></div><span class="status-chip ${G.statusClass(assignment.status)}">${G.statusLabel(assignment.status)}</span></div>
      <div class="card-body">
        <div class="assignment-links"><span><strong>Branch</strong><code>${G.escapeHtml(roleBranches[team.role])}</code></span><span><strong>Mission issue</strong>${assignment.issueNumber ? `<a target="_blank" rel="noopener" href="${G.escapeHtml(issueUrl)}">#${assignment.issueNumber}</a>` : `<em>Not prepared</em>`}</span></div>
        <div data-assignment-state><div class="student-collab-stats"><div><strong>…</strong><span>Loading workflow</span></div></div></div>
        <div class="student-next-action" data-assignment-next><strong>Next action</strong><span>Load the current signed Gitea evidence.</span></div>
        ${renderRoleGuide(team.role, assignment.issueNumber)}
        <div data-assignment-workflow><div class="empty-state">Loading signed workflow evidence…</div></div>
        ${canStart ? "" : `<div class="notice warning"><strong>Gitea access required.</strong> Save your exact Gitea username on the <a href="student-profile.html">Profile page</a>, then ask the instructor to repair the workspace.</div>`}
        <div class="team-builder-actions collaboration-actions">
          <button class="primary-action" type="button" data-collab-start="${assignment.id}" ${canStart ? "" : "disabled"}><i data-lucide="terminal-square"></i>${assignment.run?.sandbox ? "Continue workspace" : "Start collaboration workspace"}</button>
          <button class="secondary-action" type="button" data-collab-refresh="${assignment.id}"><i data-lucide="refresh-cw"></i>Refresh progress</button>
          <button class="secondary-action" type="button" data-collab-assess="${assignment.id}"><i data-lucide="scan-search"></i>Check workflow</button>
          <button class="secondary-action" type="button" data-collab-report="${assignment.id}"><i data-lucide="file-check-2"></i>View report</button>
        </div>
      </div>
    </section>`;
  }

  function renderExistingTeam(team) {
    currentTeam = team;
    const gitea = team.gitea;
    const cloneUrl = gitea?.url ? `${gitea.url}.git` : "";
    const repositoryUrl = G.safeExternalUrl(gitea?.url);
    const myBranch = roleBranches[team.role] || "feature/collaboration";
    root.innerHTML = `
      <section class="page-intro team-page-summary"><div><div class="mission-meta"><span class="tag">${G.escapeHtml(G.roleLabel(team.role))}</span><span class="tag ${team.currentStudentGiteaUsername ? "green" : "dark"}">${team.currentStudentGiteaUsername ? `Gitea: ${G.escapeHtml(team.currentStudentGiteaUsername)}` : "Gitea not linked"}</span></div><h2>${G.escapeHtml(team.name)}</h2><p>Your team repository is the shared source of truth. GitStack records signed Gitea events automatically and sends the same evidence to the instructor collaboration report.</p></div></section>
      ${gitea ? `<section class="card gitea-student-card"><div class="card-head"><div><h3><i data-lucide="github"></i> Team Gitea repository</h3><small>Owned by the GitStack organization; access is controlled through your team.</small></div><span class="tag green">${G.escapeHtml(gitea.teamName || "Team access")}</span></div><div class="card-body"><div class="gitea-repo-summary"><div><strong>${G.escapeHtml(gitea.owner)}/${G.escapeHtml(gitea.repository)}</strong><small>Default branch: ${G.escapeHtml(gitea.defaultBranch || "main")} · Your branch: ${G.escapeHtml(myBranch)}</small></div><div class="team-builder-actions"><a class="primary-action" target="_blank" rel="noopener" href="${G.escapeHtml(repositoryUrl)}">Open Gitea</a><button class="secondary-action" id="copyCloneUrl" type="button">Copy clone URL</button></div></div><div class="clone-box"><label>Clone URL</label><code id="studentCloneUrl">${G.escapeHtml(cloneUrl)}</code></div><div class="gitea-workflow"><h4>How evidence reaches the instructor</h4><ol><li>Start the isolated collaboration workspace from the assignment card.</li><li>Commit and push only from your assigned branch with your own Gitea account.</li><li>Create/review Pull Requests in Gitea and reference the mission issue.</li><li>The signed webhook records each event and refreshes both student and instructor assessments.</li><li>Use <strong>Refresh progress</strong> or <strong>Check workflow</strong> to see what remains.</li></ol></div><div class="notice info">GitStack never displays or stores your personal Gitea token in this page. Enter it only as the Git password when the terminal asks.</div></div></section>` : `<section class="card"><div class="card-body"><div class="empty-state"><strong>Your team repository is not provisioned yet.</strong><br>The instructor must prepare the collaboration workspace before students can start.</div></div></section>`}
      <section class="team-layout">
        <div class="card"><div class="card-head"><h3>Team members</h3></div><div class="card-body">${team.members.map((member) => `<div class="team-member"><div class="member-left"><span class="avatar">${G.escapeHtml((member.fullName || "?")[0])}</span><div><strong>${G.escapeHtml(member.fullName)}</strong><small>${G.escapeHtml(member.universityId)} • ${G.escapeHtml(G.roleLabel(member.teamRole))}</small></div></div><span class="tag">${member.xp} XP</span></div>`).join("")}</div></div>
        <div class="card"><div class="card-head"><h3>Mission rules</h3></div><div class="card-body team-guidance"><p>All three students must use their own linked Gitea accounts. The instructor receives evidence only when the real actor, branch, Pull Request, review, test and merge order are correct.</p><div class="role-guide"><span class="tag">Issue linked</span><span class="tag">Feature merged first</span><span class="tag">Test merged second</span></div><p class="rank-note">Do not push directly to main and do not share the instructor service token.</p></div></div>
      </section>
      <div class="student-assignment-list">${team.assignments.length ? team.assignments.map((assignment) => assignmentCard(assignment, team)).join("") : `<div class="card"><div class="empty-state">No team mission assigned yet.</div></div>`}</div>
      <section id="collaborationReportRoot" class="card collaboration-report-card" hidden></section>`;

    window.lucide?.createIcons?.();
    refreshAllReports({ silent: true });
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (!document.hidden) refreshAllReports({ silent: true });
    }, 30000);
  }

  async function renderTeamBuilder() {
    currentTeam = null;
    const candidateData = await G.api("/api/student/team/candidates");
    if (!candidateData.canCreate) {
      root.innerHTML = `<div class="card"><div class="empty-state">You already belong to a team. Refresh this page to load the current team.</div></div>`;
      return;
    }

    const candidates = candidateData.students || [];
    const candidateOptions = (selected = "") => candidates.map((student) => `<option value="${student.id}" ${student.id === selected ? "selected" : ""}>${G.escapeHtml(student.fullName)} · ${G.escapeHtml(student.universityId)} · ${student.xp} XP</option>`).join("");

    root.innerHTML = `<section class="team-builder-layout"><div class="card team-builder-card"><div class="card-head"><div><h3>Form your own team</h3><small>Create a three-person team now, or wait for an instructor to create one.</small></div></div><div class="card-body"><form id="studentTeamForm"><div class="form-group"><label for="studentTeamName">Team name</label><input id="studentTeamName" required minlength="2" maxlength="80" placeholder="Example: Team Orbit"></div><div class="team-form-row team-self-row"><div><strong>${G.escapeHtml(user.fullName || "You")}</strong><small>${G.escapeHtml(user.universityId || "Current student")}</small></div><select id="selfRole" required>${roleOptions("FEATURE_DEVELOPER")}</select></div><div class="team-form-row"><select id="teammateOne" required><option value="">Choose teammate 1</option>${candidateOptions()}</select><select id="teammateOneRole" required>${roleOptions("TEST_DEVELOPER")}</select></div><div class="team-form-row"><select id="teammateTwo" required><option value="">Choose teammate 2</option>${candidateOptions()}</select><select id="teammateTwoRole" required>${roleOptions("CODE_REVIEWER")}</select></div><div class="form-message" role="status"></div><div class="team-builder-actions"><button class="primary-action" type="submit"><i data-lucide="users-round"></i>Create team</button><a class="secondary-action" href="student-missions.html">Continue individual missions</a></div></form></div></div><div class="card"><div class="card-head"><h3>How team selection works</h3></div><div class="card-body team-guidance"><p>Use the XP leaderboard and mission performance to identify active students. Every team must have three different students and one unique role per member.</p><div class="role-guide"><span class="tag">Feature Developer</span><span class="tag">Test Developer</span><span class="tag">Code Reviewer</span></div><p class="rank-note">Instructors can also create teams and assign collaboration missions from their dashboard.</p></div></div></section>`;

    const form = document.getElementById("studentTeamForm");
    const message = form.querySelector(".form-message");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.className = "form-message";
      message.textContent = "";
      const teammateOne = document.getElementById("teammateOne").value;
      const teammateTwo = document.getElementById("teammateTwo").value;
      const members = [
        { userId: user.id, teamRole: document.getElementById("selfRole").value },
        { userId: teammateOne, teamRole: document.getElementById("teammateOneRole").value },
        { userId: teammateTwo, teamRole: document.getElementById("teammateTwoRole").value }
      ];
      if (!teammateOne || !teammateTwo || teammateOne === teammateTwo) {
        message.className = "form-message error show";
        message.textContent = "Choose two different teammates.";
        return;
      }
      if (new Set(members.map((member) => member.teamRole)).size !== 3) {
        message.className = "form-message error show";
        message.textContent = "Each team role must be unique.";
        return;
      }
      try {
        await G.api("/api/student/team", {
          method: "POST",
          body: JSON.stringify({ name: document.getElementById("studentTeamName").value.trim(), members })
        });
        G.toast("Team created successfully.", "success");
        const { team } = await G.api("/api/student/team");
        renderExistingTeam(team);
      } catch (error) {
        message.className = "form-message error show";
        message.textContent = error.message;
      }
    });
    window.lucide?.createIcons?.();
  }

  root.addEventListener("click", async (event) => {
    const startButton = event.target.closest("[data-collab-start]");
    if (startButton) {
      startButton.disabled = true;
      try {
        const assignmentId = startButton.dataset.collabStart;
        const data = await G.api(`/api/student/team/assignments/${assignmentId}/start`, { method: "POST" });
        const sandboxId = data.workspace?.sandbox?.sandboxId;
        if (!sandboxId) throw new Error("The collaboration sandbox was not returned. Try again.");
        G.toast("Collaboration workspace is ready.", "success");
        window.location.assign(`sandbox-terminal.html?sandbox=${encodeURIComponent(sandboxId)}&collaboration=1&assignment=${encodeURIComponent(assignmentId)}`);
      } catch (error) {
        G.toast(error.message, "error");
        startButton.disabled = false;
      }
      return;
    }

    const assessButton = event.target.closest("[data-collab-assess]");
    if (assessButton) {
      assessButton.disabled = true;
      try {
        const assignmentId = assessButton.dataset.collabAssess;
        await G.api(`/api/student/team/assignments/${assignmentId}/assess`, { method: "POST" });
        G.toast("Collaboration workflow assessed.", "success");
        const report = await loadCollaborationReport(assignmentId, { show: true });
        if (report?.myRun?.assessment?.passed) G.toast("Your collaboration mission passed.", "success");
      } catch (error) {
        G.toast(error.message, "error");
      } finally {
        assessButton.disabled = false;
      }
      return;
    }

    const reportButton = event.target.closest("[data-collab-report]");
    if (reportButton) {
      await loadCollaborationReport(reportButton.dataset.collabReport, { show: true });
      return;
    }

    const refreshButton = event.target.closest("[data-collab-refresh]");
    if (refreshButton) {
      refreshButton.disabled = true;
      const report = await loadCollaborationReport(refreshButton.dataset.collabRefresh, { silent: false });
      if (report) G.toast("Signed collaboration evidence refreshed.", "success");
      refreshButton.disabled = false;
      return;
    }

    const copyRoleButton = event.target.closest("[data-copy-role]");
    if (copyRoleButton) {
      try {
        await navigator.clipboard.writeText(guideFor(copyRoleButton.dataset.copyRole).commands.join("\n"));
        G.toast("Starter commands copied.", "success");
      } catch {
        G.toast("Could not copy the commands.", "error");
      }
      return;
    }

    if (event.target.closest("#copyCloneUrl")) {
      try {
        await navigator.clipboard.writeText(document.getElementById("studentCloneUrl")?.textContent || "");
        G.toast("Clone URL copied.", "success");
      } catch {
        G.toast("Could not copy the clone URL.", "error");
      }
    }
  });

  window.addEventListener("beforeunload", () => clearInterval(refreshTimer));

  try {
    const { team } = await G.api("/api/student/team");
    if (team) renderExistingTeam(team);
    else await renderTeamBuilder();
  } catch (error) {
    root.innerHTML = `<div class="card"><div class="empty-state">${G.escapeHtml(error.message)}</div></div>`;
  }
})();
