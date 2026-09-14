(async () => {
  "use strict";
  const G = window.GitStackStudent;
  if (!await G.ensureStudent()) return;

  const params = new URLSearchParams(location.search);
  let runId = params.get("run");
  let run = null;
  let sandbox = null;
  let socket = null;
  let xterm = null;
  let fitAddon = null;
  let timerHandle = null;

  const el = {
    empty: document.getElementById("workspaceEmpty"),
    root: document.getElementById("workspaceRoot"),
    title: document.getElementById("missionTitle"),
    description: document.getElementById("missionDescription"),
    xp: document.getElementById("missionXp"),
    status: document.getElementById("missionStatus"),
    timer: document.getElementById("missionTimer"),
    objective: document.getElementById("missionObjective"),
    steps: document.getElementById("missionSteps"),
    reset: document.getElementById("resetMission"),
    abandon: document.getElementById("abandonMission"),
    submit: document.getElementById("submitMission"),
    assessment: document.getElementById("assessmentBox"),
    connection: document.getElementById("connectionPill"),
    host: document.getElementById("xtermHost"),
    output: document.getElementById("terminalOutput"),
    form: document.getElementById("terminalForm"),
    input: document.getElementById("terminalInput"),
    send: document.getElementById("sendCommand"),
    interrupt: document.getElementById("interruptTerminal"),
    clear: document.getElementById("clearTerminal"),
    reconnect: document.getElementById("reconnectTerminal")
  };

  function append(text) {
    if (xterm) xterm.write(String(text));
    else {
      const cleaned = String(text).replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, "").replace(/\r(?!\n)/g, "\n");
      el.output.textContent += cleaned;
      el.output.scrollTop = el.output.scrollHeight;
    }
  }

  function initTerminal() {
    if (window.Terminal) {
      xterm = new window.Terminal({
        cursorBlink: true,
        convertEol: true,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 13,
        scrollback: 4000,
        theme: { background: "#15100d", foreground: "#ead9c9", cursor: "#ff8d52", selectionBackground: "#604334" }
      });
      if (window.FitAddon?.FitAddon) {
        fitAddon = new window.FitAddon.FitAddon();
        xterm.loadAddon(fitAddon);
      }
      xterm.open(el.host);
      fitAddon?.fit();
      xterm.writeln("GitStack Mission Terminal\r\n");
      xterm.onData((data) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", data }));
      });
    } else {
      el.host.hidden = true;
      el.output.hidden = false;
      append("GitStack terminal fallback ready.\n");
    }
  }

  function setConnection(status) {
    el.connection.textContent = status;
    el.connection.className = "connection-pill";
    if (status === "Connected") el.connection.classList.add("connected");
    if (status === "Connecting") el.connection.classList.add("connecting");
    const ready = status === "Connected";
    el.input.disabled = !ready;
    el.send.disabled = !ready;
    el.interrupt.disabled = !ready;
  }

  function disconnect() {
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
    setConnection("Disconnected");
  }

  async function resolveSandbox() {
    if (!run?.sandbox?.sandboxId) return null;
    try {
      const data = await G.api(`/api/sandboxes/${run.sandbox.sandboxId}`);
      sandbox = data.sandbox;
      if (!sandbox.running && sandbox.status === "STOPPED") {
        const started = await G.api(`/api/sandboxes/${sandbox.sandboxId}/start`, { method: "POST" });
        sandbox = started.sandbox;
      }
      return sandbox;
    } catch (error) {
      G.toast(error.message, "error");
      return null;
    }
  }

  async function connect() {
    disconnect();
    const current = await resolveSandbox();
    if (!current?.sandboxId || !current.running) {
      append("\r\n[terminal] No running sandbox is available. Reset the mission to create a fresh one.\r\n");
      return;
    }
    setConnection("Connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/ws/sandboxes/${current.sandboxId}/terminal`);
    socket.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "output") append(message.data);
      if (message.type === "status" && message.status === "connected") {
        setConnection("Connected");
        fitAddon?.fit();
        if (xterm && socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "resize", columns: xterm.cols, rows: xterm.rows }));
          xterm.focus();
        } else el.input.focus();
      }
      if (message.type === "error") append(`\r\n[error] ${message.error}\r\n`);
      if (message.type === "exit") append(`\r\n[terminal exited: ${message.exitCode}]\r\n`);
    };
    socket.onerror = () => append("\r\n[terminal connection error]\r\n");
    socket.onclose = () => { socket = null; setConnection("Disconnected"); };
  }

  function renderAssessment(result = run?.assessment) {
    if (!result) { el.assessment.innerHTML = ""; return; }
    const checks = result.ruleResults || result.checks || [];
    const passed = Boolean(result.passed);
    el.assessment.innerHTML = `<div class="assessment-box ${passed?'passed':''}"><div class="mission-meta"><span class="status-chip ${passed?'completed':'failed'}">${passed?'PASSED':'NEEDS WORK'}</span></div><div class="assessment-score">${result.totalScore ?? result.score ?? 0}%</div><div class="check-results">${checks.map(item=>`<div class="check-result ${item.passed?'pass':'fail'}"><span>${item.passed?'✓':'✕'}</span><span><strong>${G.escapeHtml(item.label)}</strong>${item.detail?`<br><small>${G.escapeHtml(item.detail)}</small>`:''}</span></div>`).join('')}</div>${(run?.feedback||[]).map(item=>`<div class="feedback-bubble">${G.escapeHtml(item.message)}</div>`).join('')}</div>`;
  }

  function startCountdown() {
    clearInterval(timerHandle);
    const tick = () => {
      if (!run?.expiresAt) { el.timer.textContent = "No timer"; return; }
      const remaining = new Date(run.expiresAt).getTime() - Date.now();
      if (remaining <= 0) { el.timer.textContent = "Time expired"; return; }
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      el.timer.textContent = `${minutes}:${String(seconds).padStart(2,"0")} left`;
    };
    tick();
    timerHandle = setInterval(tick, 1000);
  }

  function renderRun() {
    if (!run) return;
    const instructions = run.mission.instructions || {};
    el.empty.hidden = true;
    el.root.hidden = false;
    el.title.textContent = run.mission.title;
    el.description.textContent = run.mission.description;
    el.xp.textContent = `${run.mission.xpReward} XP`;
    el.status.textContent = G.statusLabel(run.status);
    el.status.className = `tag ${G.statusClass(run.status)}`;
    el.objective.textContent = instructions.objective || "Complete the required Git workflow inside the sandbox.";
    el.steps.innerHTML = (instructions.steps || []).map(step => `<li>${G.escapeHtml(step)}</li>`).join("");
    el.submit.disabled = run.status === "COMPLETED";
    el.reset.disabled = run.status === "COMPLETED";
    renderAssessment();
    startCountdown();
    window.lucide?.createIcons?.();
  }

  async function loadRun() {
    if (!runId) {
      const dashboard = await G.api("/api/student/dashboard");
      if (dashboard.activeRun) {
        runId = dashboard.activeRun.id;
        history.replaceState(null, "", `student-mission.html?run=${encodeURIComponent(runId)}`);
      } else return;
    }
    const data = await G.api(`/api/student/mission-runs/${encodeURIComponent(runId)}`);
    run = data.run;
    renderRun();
    await connect();
  }

  el.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const command = el.input.value;
    if (!command || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "input", data: `${command}\r` }));
    el.input.value = "";
  });
  el.interrupt.addEventListener("click", () => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", data: "\u0003" }));
  });
  el.clear.addEventListener("click", () => xterm ? xterm.clear() : (el.output.textContent = ""));
  el.reconnect.addEventListener("click", connect);
  el.reset.addEventListener("click", async () => {
    if (!confirm("Reset this mission workspace? All current mission files will be removed.")) return;
    try {
      disconnect();
      const data = await G.api(`/api/student/mission-runs/${run.id}/reset`, { method: "POST" });
      run = data.run;
      sandbox = data.sandbox;
      if (xterm) { xterm.clear(); xterm.writeln("Mission workspace reset.\r\n"); }
      renderRun();
      await connect();
      G.toast("Mission workspace reset.", "success");
    } catch (error) { G.toast(error.message, "error"); }
  });
  el.submit.addEventListener("click", async () => {
    try {
      el.submit.disabled = true;
      el.submit.textContent = "Checking repository…";
      const data = await G.api(`/api/student/mission-runs/${run.id}/submit`, { method: "POST" });
      run = data.run;
      renderRun();
      document.querySelectorAll("[data-student-xp]").forEach((node) => node.textContent = `${data.xp} XP`);
      G.toast(data.message, data.passed ? "success" : "error");
      if (!data.passed) append("\r\n[assessment] Mission needs more work. Check the feedback panel.\r\n");
      else append(`\r\n[assessment] Mission passed! +${data.xpAwarded} XP\r\n`);
    } catch (error) {
      G.toast(error.message, "error");
      el.submit.disabled = false;
    } finally {
      if (run?.status !== "COMPLETED") el.submit.textContent = "Submit mission";
    }
  });
  el.abandon.addEventListener("click", async () => {
    if (!confirm("Abandon this attempt and delete its sandbox?")) return;
    try {
      disconnect();
      await G.api(`/api/student/mission-runs/${run.id}/abandon`, { method: "POST" });
      window.location.assign("student-missions.html");
    } catch (error) { G.toast(error.message, "error"); }
  });
  window.addEventListener("resize", () => {
    fitAddon?.fit();
    if (xterm && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "resize", columns: xterm.cols, rows: xterm.rows }));
  });
  window.addEventListener("beforeunload", () => { clearInterval(timerHandle); disconnect(); });

  initTerminal();
  try { await loadRun(); } catch (error) { G.toast(error.message, "error"); append(`\r\n[error] ${error.message}\r\n`); }
})();
