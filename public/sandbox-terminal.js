(() => {
  const elements = {
    authState: document.getElementById("authState"),
    missionSelect: document.getElementById("missionSelect"),
    modeSelect: document.getElementById("modeSelect"),
    createButton: document.getElementById("createButton"),
    startButton: document.getElementById("startButton"),
    stopButton: document.getElementById("stopButton"),
    resetButton: document.getElementById("resetButton"),
    deleteButton: document.getElementById("deleteButton"),
    connectButton: document.getElementById("connectButton"),
    statusValue: document.getElementById("statusValue"),
    sandboxIdValue: document.getElementById("sandboxIdValue"),
    modeValue: document.getElementById("modeValue"),
    expiresValue: document.getElementById("expiresValue"),
    connectionPill: document.getElementById("connectionPill"),
    xtermHost: document.getElementById("xtermHost"),
    terminalOutput: document.getElementById("terminalOutput"),
    terminalForm: document.getElementById("terminalForm"),
    terminalInput: document.getElementById("terminalInput"),
    sendButton: document.getElementById("sendButton"),
    interruptButton: document.getElementById("interruptButton"),
    scrollTerminalButton: document.getElementById("scrollTerminalButton"),
    clearButton: document.getElementById("clearButton"),
    sandboxEyebrow: document.getElementById("sandboxEyebrow"),
    sandboxTitle: document.getElementById("sandboxTitle"),
    sandboxDescription: document.getElementById("sandboxDescription"),
    sandboxCreateControls: document.getElementById("sandboxCreateControls"),
    terminalPath: document.getElementById("terminalPath"),
    terminalTip: document.getElementById("terminalTip"),
    collaborationContext: document.getElementById("collaborationContext"),
    collaborationMissionTitle: document.getElementById("collaborationMissionTitle"),
    collaborationMissionSummary: document.getElementById("collaborationMissionSummary"),
    collaborationRole: document.getElementById("collaborationRole"),
    collaborationBranch: document.getElementById("collaborationBranch"),
    collaborationIssue: document.getElementById("collaborationIssue"),
    collaborationProgress: document.getElementById("collaborationProgress"),
    collaborationProgressBar: document.getElementById("collaborationProgressBar"),
    collaborationRoleSteps: document.getElementById("collaborationRoleSteps"),
    collaborationEvidence: document.getElementById("collaborationEvidence"),
    backToTeamActivity: document.getElementById("backToTeamActivity"),
    collaborationIssueLink: document.getElementById("collaborationIssueLink"),
    collaborationRepoLink: document.getElementById("collaborationRepoLink"),
    refreshCollaborationButton: document.getElementById("refreshCollaborationButton"),
    assessCollaborationButton: document.getElementById("assessCollaborationButton")
  };

  const queryParams = new URLSearchParams(location.search);
  const queryMission = queryParams.get("mission");
  let querySandbox = queryParams.get("sandbox");
  const queryAssignment = queryParams.get("assignment");
  const collaborationMode = queryParams.get("collaboration") === "1" && Boolean(queryAssignment);
  let initialCollaborationOpened = false;
  let currentSandbox = null;
  let collaborationReport = null;
  let socket = null;
  let lastSentCommand = "";
  let lastSentCommandAt = 0;
  let xterm = null;
  let fitAddon = null;
  let terminalDimensions = "";
  let collaborationRefreshTimer = null;
  let collaborationStateVersion = "";
  let socketSandboxId = null;
  let terminalConnectionTimer = null;
  let initialDataPromise = null;
  let reconnectBusy = false;
  let automaticRecoveryUsed = false;
  let collaborationSetupFailed = false;
  let collaborationPreparationPromise = null;
  const roleBranches = {
    FEATURE_DEVELOPER: "feature/login-improvement",
    TEST_DEVELOPER: "test/login-improvement",
    CODE_REVIEWER: "review/login-improvement"
  };
  const roleInstructions = {
    FEATURE_DEVELOPER: [
      "Work only on feature/login-improvement.",
      "Update src/login-policy.txt in at least two meaningful commits.",
      "Push the feature branch and open a Pull Request that references the mission issue.",
      "After changes are requested, make another real commit and push it before approval."
    ],
    TEST_DEVELOPER: [
      "Work only on test/login-improvement and record the expected failing test first.",
      "Push the test branch and open a Pull Request that references the mission issue.",
      "Wait until the Feature PR is merged, then merge origin/main into your branch.",
      "Resolve src/login-policy.txt to secure-verified, record PASS evidence, commit and push."
    ],
    CODE_REVIEWER: [
      "Use your own Gitea account to submit a specific review comment.",
      "Request changes on the Feature PR before any final approval.",
      "Approve and merge the Feature PR first after its follow-up commit.",
      "Verify FAIL and PASS test evidence, then approve and merge the Test PR second."
    ]
  };

  if (window.Terminal) {
    xterm = new window.Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 14,
      scrollback: 3000,
      theme: {
        background: "#15100d",
        foreground: "#e7d7c9",
        cursor: "#ff9053",
        selectionBackground: "#604334"
      }
    });
    if (window.FitAddon?.FitAddon) {
      fitAddon = new window.FitAddon.FitAddon();
      xterm.loadAddon(fitAddon);
    }
    elements.xtermHost.hidden = false;
    elements.terminalOutput.hidden = true;
    xterm.open(elements.xtermHost);
    if (collaborationMode) elements.scrollTerminalButton.hidden = false;
    fitAddon?.fit();
    if (collaborationMode) xterm.options.disableStdin = true;
    xterm.writeln(collaborationMode ? "Welcome to your GitStack team collaboration workspace." : "Welcome to the GitStack Docker sandbox.");
    xterm.writeln(collaborationMode ? "Verifying your repository in /workspace/team-repo.\r\n" : "Log in, create a sandbox, then run Git commands here.\r\n");
    let lastTerminalInput = "";
    let lastTerminalInputAt = 0;

    xterm.onData((data) => {
      const now = Date.now();

      // In the collaboration shell, repeated keystrokes are real input (for
      // example the two m's in "commit"). Keep the existing dedupe behavior
      // for the unrelated sandbox modes.
      if (
        !collaborationMode &&
        data === lastTerminalInput &&
        now - lastTerminalInputAt < 250
      ) {
        return;
      }

      lastTerminalInput = data;
      lastTerminalInputAt = now;

      if (socket?.readyState === WebSocket.OPEN && (!collaborationMode || elements.connectionPill.textContent === "Connected")) {
        scrollTerminalToLatest();
        socket.send(JSON.stringify({ type: "input", data }));
      }
    });
  }
  function scrollTerminalToLatest() {
    if (!xterm) return;
    xterm.scrollToBottom();
    const viewport = elements.xtermHost.querySelector?.(".xterm-viewport");
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }
  function appendOutput(text) {
    if (xterm) {
      xterm.write(String(text), scrollTerminalToLatest);
      return;
    }
    const cleaned = String(text)
      .replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, "")
      .replace(/\r(?!\n)/g, "\n");
    elements.terminalOutput.textContent += cleaned;
    if (elements.terminalOutput.textContent.length > 200000) {
      elements.terminalOutput.textContent = elements.terminalOutput.textContent.slice(-150000);
    }
    elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight;
  }

  async function api(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      ...(collaborationMode && !options.signal ? {
        signal: AbortSignal.timeout(url.endsWith("/start") ? 90_000 : 20_000)
      } : {}),
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
      });
    } catch (cause) {
      if (collaborationMode && ["AbortError", "TimeoutError"].includes(cause?.name)) {
        const error = new Error("The workspace request timed out. Retry Reconnect terminal after checking that Docker and Gitea are running.");
        error.status = 504;
        error.code = "WORKSPACE_REQUEST_TIMEOUT";
        throw error;
      }
      throw cause;
    }
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.error || `Request failed (${response.status}).`);
      error.status = response.status;
      error.code = body?.code || "REQUEST_FAILED";
      error.details = body?.details || null;
      throw error;
    }
    return body;
  }

  function rememberPreparedSandbox(sandbox) {
    if (!sandbox?.sandboxId || sandbox.sandboxId === querySandbox) return;
    querySandbox = sandbox.sandboxId;
    queryParams.set("sandbox", querySandbox);
    history.replaceState(null, "", `${location.pathname}?${queryParams.toString()}`);
  }

  async function prepareCollaborationWorkspace() {
    if (collaborationPreparationPromise) return collaborationPreparationPromise;
    collaborationPreparationPromise = (async () => {
      const prepared = await api(`/api/student/team/assignments/${encodeURIComponent(queryAssignment)}/start`, { method: "POST" });
      const sandbox = prepared.workspace?.sandbox || null;
      if (!sandbox?.sandboxId) throw new Error("The collaboration sandbox was not returned. Try again from Team Activity.");
      // A successful response already verifies the clone and assigned branch.
      rememberPreparedSandbox(sandbox);
      collaborationSetupFailed = false;
      return sandbox;
    })().finally(() => {
      collaborationPreparationPromise = null;
      renderSandbox();
    });
    renderSandbox();
    return collaborationPreparationPromise;
  }

  async function collaborationWorkspaceHealth() {
    const data = await api(`/api/student/team/assignments/${encodeURIComponent(queryAssignment)}/workspace-health`);
    return data.workspace;
  }

  function roleLabel(role) {
    return {
      FEATURE_DEVELOPER: "Feature Developer",
      TEST_DEVELOPER: "Test Developer",
      CODE_REVIEWER: "Code Reviewer"
    }[role] || "Team member";
  }

  function safeExternalUrl(value) {
    try {
      const raw = String(value || "").trim();
      if (!raw) return "";
      const url = new URL(raw, location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function setCollaborationPresentation() {
    if (!collaborationMode) return;
    document.body.classList.add("collaboration-terminal-page");
    elements.collaborationContext.hidden = false;
    elements.sandboxCreateControls.hidden = true;
    elements.sandboxEyebrow.textContent = "TEAM MISSION WORKSPACE";
    elements.sandboxTitle.textContent = "Complete your role and push real collaboration evidence";
    elements.sandboxDescription.textContent = "This terminal is linked to your assignment and assigned Gitea branch. Signed pushes, Pull Requests, reviews, tests and merges appear in both student and instructor reports.";
    elements.terminalPath.textContent = "student@gitstack:/workspace/team-repo";
    elements.terminalTip.innerHTML = "Use <code>git status -sb</code> after committing and pushing to verify your assigned branch is up to date.";
    if (elements.backToTeamActivity) {
      elements.backToTeamActivity.href = `student-team.html?assignment=${encodeURIComponent(queryAssignment)}`;
    }
  }

  function showStudentNavigation() {
    if (!collaborationMode) return;
    const dashboard = document.querySelector(".nav-signup");
    const team = document.querySelector(".nav-login");
    const brand = document.querySelector(".site-header .brand");
    if (brand) brand.href = "student-dashboard.html";
    if (dashboard) {
      dashboard.classList.remove("nav-signup");
      dashboard.classList.add("dashboard-return");
      dashboard.href = "student-dashboard.html";
      dashboard.textContent = "Dashboard";
    }
    team?.remove();
  }

  function renderCollaborationReport(report) {
    collaborationReport = report;
    const role = report.myRun?.role || "";
    const branch = report.myRun?.branch || roleBranches[role] || "role branch";
    const workflow = report.workflow || {};
    const assessment = report.myRun?.assessment || null;
    const issueNumber = report.assignment?.issueNumber || null;
    const issueReference = issueNumber ? `Closes #${issueNumber}` : "Waiting for issue";

    elements.collaborationMissionTitle.textContent = report.mission?.title || "Team collaboration mission";
    elements.collaborationMissionSummary.textContent = report.mission?.description || "Complete the assigned role workflow in the shared Gitea repository.";
    elements.collaborationRole.textContent = roleLabel(role);
    elements.collaborationBranch.textContent = branch;
    elements.collaborationIssue.textContent = issueReference;
    elements.collaborationProgress.textContent = `${workflow.percent || 0}%`;
    elements.collaborationProgressBar.style.width = `${Math.min(100, Math.max(0, workflow.percent || 0))}%`;
    const nextAction = report.myRun?.nextAction?.label || "Follow the role steps below.";
    const feedback = report.myRun?.reviewFeedback?.message || report.myRun?.feedback?.[0]?.message || "";
    elements.collaborationEvidence.textContent = `${report.stats?.totalEvents || 0} signed event(s) · ${workflow.completedSteps || 0}/${workflow.totalSteps || 11} workflow stages${assessment ? ` · Your score ${assessment.totalScore}%` : " · Not assessed yet"} · Next: ${nextAction}${feedback ? ` · Feedback: ${feedback}` : ""}`;

    elements.collaborationRoleSteps.replaceChildren();
    for (const step of [nextAction, ...(roleInstructions[role] || ["Follow COLLABORATION_MISSION.md and use your own Gitea account."])]) {
      const item = document.createElement("li");
      item.textContent = step;
      elements.collaborationRoleSteps.append(item);
    }

    const issueUrl = safeExternalUrl(report.assignment?.issueUrl);
    elements.collaborationIssueLink.hidden = !issueUrl;
    if (issueUrl) elements.collaborationIssueLink.href = issueUrl;
    const repositoryUrl = safeExternalUrl(report.team?.repository?.url);
    elements.collaborationRepoLink.hidden = !repositoryUrl;
    if (repositoryUrl) {
      elements.collaborationRepoLink.href = repositoryUrl;
      elements.collaborationRepoLink.textContent = "Open Gitea";
    }
  }

  async function loadCollaborationReport({ silent = false } = {}) {
    if (!collaborationMode) return null;
    const { report } = await api(`/api/student/team/assignments/${encodeURIComponent(queryAssignment)}/report`);
    if (silent && report.sync?.version && report.sync.version === collaborationStateVersion) return report;
    collaborationStateVersion = report.sync?.version || "";
    renderCollaborationReport(report);
    return report;
  }

  function setConnection(status) {
    elements.connectionPill.textContent = status;
    elements.connectionPill.className = "connection-pill";
    if (status === "Connected") elements.connectionPill.classList.add("connected");
    if (status === "Connecting") elements.connectionPill.classList.add("connecting");
    const connected = status === "Connected";
    if (collaborationMode && xterm) xterm.options.disableStdin = !connected;
    elements.terminalInput.disabled = !connected;
    elements.sendButton.disabled = !connected;
    elements.interruptButton.disabled = !connected;
  }

  function renderSandbox() {
    const sandbox = currentSandbox;
    elements.statusValue.textContent = collaborationMode && sandbox
      ? sandbox.pendingVerification ? "Checking" : sandbox.running ? "RUNNING" : "STOPPED"
      : sandbox?.status || "No sandbox";
    elements.sandboxIdValue.textContent = sandbox?.sandboxId || "—";
    elements.modeValue.textContent = sandbox?.mode || "—";
    elements.expiresValue.textContent = sandbox?.expiresAt
      ? new Date(sandbox.expiresAt).toLocaleString()
      : "—";
    const exists = Boolean(sandbox?.sandboxId) && sandbox.status !== "DELETED";
    const busy = collaborationMode && Boolean(reconnectBusy || collaborationPreparationPromise);
    elements.startButton.disabled = busy || !exists || sandbox.running;
    elements.stopButton.disabled = busy || !exists || !sandbox.running;
    elements.resetButton.disabled = busy || !exists;
    elements.deleteButton.disabled = busy || !exists;
    elements.connectButton.disabled = collaborationMode
      ? busy || !elements.authState.classList.contains("ready")
      : !exists || !sandbox.running;
    elements.createButton.disabled = exists;
  }

  function disconnectSocket() {
    clearTimeout(terminalConnectionTimer);
    terminalConnectionTimer = null;
    const activeSocket = socket;
    socket = null;
    socketSandboxId = null;
    if (activeSocket) {
      activeSocket.onclose = null;
      activeSocket.close();
    }
    setConnection("Disconnected");
  }

  function terminalSocketIsActive(sandboxId) {
    return Boolean(
      socket
      && socketSandboxId === sandboxId
      && [WebSocket.CONNECTING, WebSocket.OPEN].includes(socket.readyState)
    );
  }

  function fitTerminal() {
    if (!xterm || !fitAddon) return;
    fitAddon.fit();
    if (!collaborationMode || socket?.readyState !== WebSocket.OPEN) return;
    if (xterm.cols < 20 || xterm.cols > 300 || xterm.rows < 5 || xterm.rows > 120) return;
    const dimensions = `${xterm.cols}x${xterm.rows}`;
    if (terminalDimensions === dimensions) return;
    terminalDimensions = dimensions;
    socket.send(JSON.stringify({ type: "resize", columns: xterm.cols, rows: xterm.rows }));
  }

  function connectTerminal({ force = false } = {}) {
    const sandboxId = currentSandbox?.sandboxId;
    if (!sandboxId || !currentSandbox.running) return;
    if (!force && terminalSocketIsActive(sandboxId)) return;

    disconnectSocket();
    setConnection("Connecting");
    fitAddon?.fit();
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const size = collaborationMode && xterm
      ? `?columns=${xterm.cols}&rows=${xterm.rows}`
      : "";
    const nextSocket = new WebSocket(
      `${protocol}//${location.host}/ws/sandboxes/${sandboxId}/terminal${size}`
    );
    socket = nextSocket;
    socketSandboxId = sandboxId;
    terminalDimensions = collaborationMode && xterm ? `${xterm.cols}x${xterm.rows}` : "";
    let terminalFailed = false;

    if (collaborationMode) {
      terminalConnectionTimer = setTimeout(() => {
        if (socket !== nextSocket || elements.connectionPill.textContent === "Connected") return;
        terminalFailed = true;
        appendOutput("\n[terminal connection timed out] Checking the collaboration workspace…\n");
        nextSocket.close();
      }, 25_000);
    }

    nextSocket.onmessage = (event) => {
      if (socket !== nextSocket) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "output") appendOutput(message.data);
      if (message.type === "status" && message.status === "connected") {
        clearTimeout(terminalConnectionTimer);
        terminalConnectionTimer = null;
        if (currentSandbox?.sandboxId === sandboxId) {
          currentSandbox.pendingVerification = false;
          renderSandbox();
        }
        setConnection("Connected");
        collaborationSetupFailed = false;
        automaticRecoveryUsed = false;
        fitTerminal();
        if (xterm) xterm.focus();
        else elements.terminalInput.focus();
      }
      if (message.type === "error") appendOutput(`\n[error] ${message.error}\n`);
      if (message.type === "exit") {
        terminalFailed = message.exitCode !== 0;
        appendOutput(`\n[terminal exited: ${message.exitCode}]\n`);
      }
    };
    nextSocket.onerror = () => {
      if (socket === nextSocket) appendOutput("\n[terminal connection error]\n");
    };
    nextSocket.onclose = (event) => {
      if (socket === nextSocket) {
        clearTimeout(terminalConnectionTimer);
        terminalConnectionTimer = null;
        socket = null;
        socketSandboxId = null;
        setConnection("Disconnected");
        if (collaborationMode && (terminalFailed || event.code !== 1000) &&
            event.reason !== "A newer terminal connection was opened.") {
          void reconnectCollaborationTerminal({ automatic: true });
        }
      }
    };
  }

  async function reconnectCollaborationTerminal({ automatic = false } = {}) {
    if (reconnectBusy || (automatic && automaticRecoveryUsed)) return;
    reconnectBusy = true;
    if (automatic) automaticRecoveryUsed = true;
    try {
      renderSandbox();
      setConnection("Restoring");
      elements.statusValue.textContent = "Restoring";
      const health = await collaborationWorkspaceHealth();
      if (!health?.ready || health.sandboxId !== currentSandbox?.sandboxId) {
        appendOutput("\r\n[workspace] Restoring your assigned repository from Gitea…\r\n");
        currentSandbox = await prepareCollaborationWorkspace();
      } else {
        currentSandbox = health.sandbox;
      }
      if (!currentSandbox?.running) throw new Error("The collaboration sandbox is not running. Try Start or return to Team Activity.");
      currentSandbox.pendingVerification = false;
      renderSandbox();
      connectTerminal({ force: true });
    } catch (error) {
      appendOutput(`\r\n[workspace error] ${error.message}\r\nReturn to Team Activity and retry Continue workspace.\r\n`);
      currentSandbox = null;
      collaborationSetupFailed = true;
      renderSandbox();
      setConnection("Disconnected");
    } finally {
      reconnectBusy = false;
      renderSandbox();
    }
  }

  async function refreshSandbox() {
    if (!currentSandbox?.sandboxId) return;
    const data = await api(`/api/sandboxes/${currentSandbox.sandboxId}`);
    currentSandbox = data.sandbox;
    renderSandbox();
  }

  async function loadInitialData() {
    let authenticated = false;
    try {
      const me = await api("/api/auth/me");
      authenticated = true;
      elements.authState.textContent = `Logged in as ${me.user.fullName}`;
      elements.authState.classList.remove("error");
      elements.authState.classList.add("ready");
      elements.authState.style.cursor = "default";
      elements.authState.onclick = null;
      if (collaborationMode) {
        showStudentNavigation();
        elements.modeSelect.value = "collaboration";
        if (!initialCollaborationOpened) {
          initialCollaborationOpened = true;
          // Evidence loads independently of the Docker shell.
          void loadCollaborationReport().catch((error) => {
            elements.collaborationEvidence.textContent = `Evidence is temporarily unavailable: ${error.message}`;
          });
          if (queryParams.has("prepared")) {
            queryParams.delete("prepared");
            history.replaceState(null, "", `${location.pathname}?${queryParams.toString()}`);
          }
          if (querySandbox && /^[0-9a-f-]{36}$/i.test(querySandbox)) {
            // The gateway verifies ownership and Docker state before accepting
            // the connection. A stopped or missing clone triggers repair.
            currentSandbox = {
              sandboxId: querySandbox, mode: "COLLABORATION", status: "RUNNING",
              running: true, pendingVerification: true
            };
            renderSandbox();
            connectTerminal();
            return;
          }
          setConnection("Preparing");
          elements.statusValue.textContent = "Preparing";
          appendOutput("\r\n[workspace] Preparing your assigned repository and branch…\r\n");
          currentSandbox = await prepareCollaborationWorkspace();
          renderSandbox();
          connectTerminal();
          return;
        }
        if (!terminalSocketIsActive(currentSandbox?.sandboxId) && !reconnectBusy && !collaborationSetupFailed) {
          await reconnectCollaborationTerminal();
        }
        return;
      }
      elements.missionSelect
        .querySelectorAll('option:not([value=""])')
        .forEach((option) => option.remove());
      const missions = await api("/api/missions");
      for (const mission of missions.missions) {
        if (mission.missionType !== "individual") continue;
        const option = document.createElement("option");
        option.value = mission.slug;
        option.textContent = mission.title;
        if (mission.slug === queryMission) option.selected = true;
        elements.missionSelect.append(option);
      }
      const list = await api("/api/sandboxes");
      currentSandbox = list.sandboxes.find((item) => ["RUNNING", "STOPPED", "CREATED"].includes(item.status)) || null;
      renderSandbox();
      if (currentSandbox?.running) connectTerminal();
    } catch (error) {
      const authenticationRequired = error.status === 401;
      if (collaborationMode && authenticated && !authenticationRequired) {
        // A repository failure does not log the student out. Keep an enabled
        // retry button and end the Preparing/Restoring state explicitly.
        collaborationSetupFailed = true;
        currentSandbox = null;
        renderSandbox();
        setConnection("Disconnected");
        const code = error.code && error.code !== "REQUEST_FAILED" ? ` (${error.code})` : "";
        appendOutput(`\n[workspace error${code}] ${error.message}\nUse Reconnect terminal to retry, or return to Team Activity.\n`);
        return;
      }
      elements.authState.textContent = authenticationRequired ? "Please log in first" : "Workspace setup failed";
      elements.authState.classList.remove("ready");
      elements.authState.classList.add("error");
      elements.authState.style.cursor = authenticationRequired ? "pointer" : "default";
      elements.authState.onclick = authenticationRequired
        ? () => window.location.assign("login.html?role=student")
        : null;
      if (collaborationMode) {
        currentSandbox = null;
        disconnectSocket();
        renderSandbox();
      }
      elements.createButton.disabled = true;
      if (authenticationRequired) {
        appendOutput(`\n${error.message}\nOpen the Login page, then return here.\n`);
      } else {
        const code = error.code && error.code !== "REQUEST_FAILED" ? ` (${error.code})` : "";
        appendOutput(`\n[workspace error${code}] ${error.message}\nReturn to Team Activity and retry Start collaboration workspace.\n`);
      }
    }
  }

  function refreshInitialData() {
    if (initialDataPromise) return initialDataPromise;
    initialDataPromise = loadInitialData().finally(() => {
      initialDataPromise = null;
    });
    return initialDataPromise;
  }

  elements.createButton.addEventListener("click", async () => {
    try {
      elements.createButton.disabled = true;
      appendOutput("\nCreating a secure Docker sandbox…\n");
      const body = {
        mode: elements.modeSelect.value,
        ...(elements.missionSelect.value ? { missionSlug: elements.missionSelect.value } : {})
      };
      const data = await api("/api/sandboxes", {
        method: "POST",
        body: JSON.stringify(body)
      });
      currentSandbox = data.sandbox;
      renderSandbox();
      appendOutput(`Sandbox ${currentSandbox.sandboxId} is running.\n`);
      connectTerminal();
    } catch (error) {
      appendOutput(`\n[error] ${error.message}\n`);
      elements.createButton.disabled = false;
    }
  });

  elements.startButton.addEventListener("click", async () => {
    try {
      if (collaborationMode) {
        currentSandbox = await prepareCollaborationWorkspace();
        if (!currentSandbox?.sandboxId) throw new Error("The collaboration workspace could not be restored.");
        void loadCollaborationReport().catch(() => {});
        appendOutput("\nCollaboration repository and assigned branch restored from Gitea.\n");
      } else {
        const data = await api(`/api/sandboxes/${currentSandbox.sandboxId}/start`, { method: "POST" });
        currentSandbox = data.sandbox;
      }
      renderSandbox();
      connectTerminal();
    } catch (error) { appendOutput(`\n[error] ${error.message}\n`); }
  });

  elements.stopButton.addEventListener("click", async () => {
    const stopMessage = collaborationMode
      ? "Stop this collaboration sandbox? Temporary and unpushed workspace files will be removed. Pushed commits remain safe in Gitea and the repository will be restored on Start."
      : "Stop this sandbox? Temporary files in /workspace will be removed.";
    if (!confirm(stopMessage)) return;
    try {
      disconnectSocket();
      const data = await api(`/api/sandboxes/${currentSandbox.sandboxId}/stop`, { method: "POST" });
      currentSandbox = data.sandbox;
      renderSandbox();
      appendOutput(collaborationMode
        ? "\nSandbox stopped. On Start, the pushed repository and assigned branch will be restored from Gitea.\n"
        : "\nSandbox stopped. Temporary workspace files were removed.\n");
    } catch (error) { appendOutput(`\n[error] ${error.message}\n`); }
  });

  elements.resetButton.addEventListener("click", async () => {
    const resetMessage = collaborationMode
      ? "Reset this collaboration workspace? Unpushed files will be removed and the assigned repository branch will be cloned again."
      : "Reset this sandbox? All files in /workspace will be removed.";
    if (!confirm(resetMessage)) return;
    try {
      disconnectSocket();
      const data = await api(`/api/sandboxes/${currentSandbox.sandboxId}/reset`, { method: "POST" });
      currentSandbox = data.sandbox;
      if (collaborationMode) {
        const prepared = await api(`/api/student/team/assignments/${encodeURIComponent(queryAssignment)}/start`, { method: "POST" });
        currentSandbox = prepared.workspace?.sandbox || currentSandbox;
        rememberPreparedSandbox(currentSandbox);
        void loadCollaborationReport().catch(() => {});
      }
      if (xterm) {
        xterm.clear();
        xterm.writeln(collaborationMode ? "Collaboration workspace reset and assigned branch restored.\r\n" : "Sandbox reset. The workspace is clean.\r\n");
      } else {
        elements.terminalOutput.textContent = collaborationMode ? "Collaboration workspace reset and assigned branch restored.\n" : "Sandbox reset. The workspace is clean.\n";
      }
      renderSandbox();
      connectTerminal();
    } catch (error) { appendOutput(`\n[error] ${error.message}\n`); }
  });

  elements.deleteButton.addEventListener("click", async () => {
    if (!confirm("Delete this sandbox and all files?")) return;
    try {
      disconnectSocket();
      await api(`/api/sandboxes/${currentSandbox.sandboxId}`, { method: "DELETE" });
      appendOutput("\nSandbox deleted.\n");
      currentSandbox = null;
      renderSandbox();
      if (collaborationMode) {
        appendOutput("Return to Team Activity and select Start collaboration workspace to create a fresh clone.\n");
      }
    } catch (error) { appendOutput(`\n[error] ${error.message}\n`); }
  });

  elements.connectButton.addEventListener("click", () => {
    if (!collaborationMode) return connectTerminal({ force: true });
    automaticRecoveryUsed = false;
    void reconnectCollaborationTerminal();
  });
  elements.terminalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const command = elements.terminalInput.value;
    if (!command || socket?.readyState !== WebSocket.OPEN) return;

    // Prevent accidental double submission from the terminal input.
    const now = Date.now();
    if (command === lastSentCommand && now - lastSentCommandAt < 1000) return;
    lastSentCommand = command;
    lastSentCommandAt = now;

    socket.send(JSON.stringify({ type: "input", data: `${command}\r` }));
    scrollTerminalToLatest();
    elements.terminalInput.value = "";
  });
  elements.interruptButton.addEventListener("click", () => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "input", data: "\u0003" }));
    }
  });
  elements.scrollTerminalButton.addEventListener("click", () => {
    scrollTerminalToLatest();
    xterm?.focus();
  });
  elements.clearButton.addEventListener("click", () => {
    if (xterm) xterm.clear();
    else elements.terminalOutput.textContent = "";
  });
  elements.refreshCollaborationButton?.addEventListener("click", async () => {
    elements.refreshCollaborationButton.disabled = true;
    try {
      await loadCollaborationReport();
    } catch (error) {
      elements.collaborationEvidence.textContent = error.message;
    } finally {
      elements.refreshCollaborationButton.disabled = false;
    }
  });
  elements.assessCollaborationButton?.addEventListener("click", async () => {
    elements.assessCollaborationButton.disabled = true;
    try {
      await api(`/api/student/team/assignments/${queryAssignment}/assess`, { method: "POST" });
      const report = await loadCollaborationReport();
      appendOutput(`\r\n[assessment] ${report?.myRun?.assessment?.passed ? "Mission passed." : "Workflow checked. Review the evidence panel for remaining work."}\r\n`);
    } catch (error) {
      elements.collaborationEvidence.textContent = error.message;
      appendOutput(`\r\n[assessment error] ${error.message}\r\n`);
    } finally {
      elements.assessCollaborationButton.disabled = false;
    }
  });
  window.addEventListener("resize", () => {
    fitTerminal();
  });
  window.addEventListener("beforeunload", () => {
    clearInterval(collaborationRefreshTimer);
    disconnectSocket();
  });
  window.addEventListener("focus", () => {
    refreshInitialData().catch(() => {});
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshInitialData().catch(() => {});
  });

  setCollaborationPresentation();
  refreshInitialData();
  if (collaborationMode) {
    collaborationRefreshTimer = setInterval(() => {
      if (!document.hidden) loadCollaborationReport({ silent: true }).catch(() => {});
    }, 15000);
  }
  if (window.lucide) window.lucide.createIcons();
})();
