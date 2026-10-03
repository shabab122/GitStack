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
  const inputHistory = [];
  let inputHistoryIndex = null;
  const revealedHints = new Map();
  const pendingHints = new Set();

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
    hintNote: document.getElementById("hintCostNote"),
    progressText: document.getElementById("missionProgressText"),
    progressBar: document.getElementById("missionProgressBar"),
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

  const inBangla = () => window.GitStackLanguage?.getLanguage?.() === "bn";
  const localized = (english, bangla) => inBangla() ? bangla : english;

  function renderHintReward() {
    if (!run?.mission) return;
    const total = Number(run.mission.xpReward) || 0;
    const earned = run.status === "COMPLETED"
      ? Number(run.xpAwarded) || 0
      : Math.max(0, total - (Number(run.hintPenaltyXp) || 0));
    el.xp.textContent = run.hintAccounting === "immediate"
      ? `${total} XP`
      : `${earned} / ${total} XP`;
    el.hintNote.textContent = run.hintAccounting === "immediate"
      ? localized(
          "This earlier attempt keeps its original immediate XP rules. Purchased hints stay unlocked; each new layer's cost is shown below. Viewing an unlocked layer again is free.",
          "এই পুরোনো চেষ্টায় আগের তাৎক্ষণিক XP নিয়ম থাকবে। কেনা ইঙ্গিত আনলক থাকবে; নতুন layer-এর খরচ নিচে দেওয়া আছে। আনলক করা layer আবার দেখা বিনামূল্যে।"
        )
      : localized(
          "Each step has 3 hints: a clue, closer guidance, then the answer command. Each new layer reduces this mission's reward by its shown cost. Viewing it again is free. All 3 hints on every step leave 0 mission XP; your existing XP stays unchanged.",
          "প্রতি ধাপে ৩টি ইঙ্গিত: ছোট clue, বিস্তারিত নির্দেশনা, তারপর উত্তর command। প্রতিটি নতুন layer-এর দেখানো খরচ এই মিশনের reward থেকে কমবে। আবার দেখা বিনামূল্যে। সব ধাপের ৩টি ইঙ্গিত নিলে এই মিশনে ০ XP পাবেন; আগের XP কমবে না।"
        );
  }

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
      if (message.type === "mission-blocked") {
        append(`\r\n[GitStack] BLOCKED: ${message.error}\r\n`);
        G.toast(message.error, "error");
      }
      if (message.type === "mission-progress") {
        const previous = Number(run?.progressPercent || 0);
        // A compound step can change its next action without changing its
        // progress percentage. Keep purchased levels but refresh their text.
        revealedHints.clear();
        renderMissionProgress(message);
        if (Number(message.progressPercent) > previous) {
          // Keep progress feedback out of the terminal stream. The real shell
          // has already drawn its next prompt; appending an asynchronous status
          // line after that prompt made the terminal look stuck and encouraged
          // users to press Ctrl+C. Progress belongs in the checklist/toast.
          G.toast(`Step ${message.completedSteps} completed — ${message.progressPercent}%`, "success");
        }
      }
      if (message.type === "error") append(`\r\n[error] ${message.error}\r\n`);
      if (message.type === "exit") append(`\r\n[terminal exited: ${message.exitCode}]\r\n`);
    };
    socket.onerror = () => append("\r\n[terminal connection error]\r\n");
    socket.onclose = () => { socket = null; setConnection("Disconnected"); };
  }

  function visibleStepText(step, index) {
    const raw = String(step || "");
    const rules = run?.mission?.validationRules || {};
    let label = raw;

    // Do not hide exact mission constraints in validationRules. If the visible
    // prose says only "the required file/branch/source", surface that parameter
    // inside the checklist rather than revealing it only after a failed submit.
    const requiredFile = String(rules.requiredFile || "").trim();
    if (
      requiredFile &&
      !raw.includes(requiredFile) &&
      /\b(?:required|project|documentation)\b/i.test(raw) &&
      /\b(?:file|document|documentation)\b/i.test(raw) &&
      !/[A-Za-z0-9._-]+\.(?:md|txt|html|css|js|json|py|sh|yml|yaml|ts|tsx|jsx)\b/i.test(raw)
    ) {
      label += ` — ${requiredFile}`;
    }

    const branchPrefix = String(rules.requiredBranchPrefix || "").trim();
    if (
      branchPrefix &&
      !raw.includes(branchPrefix) &&
      /\b(?:create|new|feature|development).*\bbranch\b|\bdevelopment workflow\b/i.test(raw)
    ) {
      label += ` — ${branchPrefix}…`;
    }

    const remotePath = String(rules.requiredRemotePath || "").trim();
    if (remotePath && /\bclone\b/i.test(raw) && !raw.includes(remotePath)) {
      label += ` — source: ${remotePath}`;
    }

    return label;
  }

  function renderMissionProgress(progress = null) {
    if (!run?.mission) return;
    const steps = run.mission.instructions?.steps || [];
    const total = Number(progress?.totalSteps) || steps.length || 1;
    const percent = Math.max(0, Math.min(100, Number(progress?.progressPercent ?? run.progressPercent) || 0));
    const completed = progress?.completedSteps != null
      ? Number(progress.completedSteps)
      : Math.min(steps.length, Math.round((percent / 100) * total));
    run.progressPercent = percent;
    if (el.progressText) el.progressText.textContent = `${percent}%`;
    if (el.progressBar) el.progressBar.style.width = `${percent}%`;
    // 100% means all guided workflow steps are satisfied, but the run is not
    // formally COMPLETED until the student submits and the assessment passes.
    // Make that distinction explicit instead of showing the contradictory
    // IN PROGRESS + 100% state.
    if (el.status && run.status !== "COMPLETED") {
      if (percent >= 100) {
        el.status.textContent = "READY TO SUBMIT";
        el.status.className = "tag ready-to-submit";
      } else {
        el.status.textContent = G.statusLabel(run.status);
        el.status.className = `tag ${G.statusClass(run.status)}`;
      }
    }
    el.steps.innerHTML = steps.map((step, index) => {
      const stateClass = index < completed ? "step-complete" : index === completed && percent < 100 ? "step-current" : "step-locked";
      const active = stateClass === "step-current" && run.status === "IN_PROGRESS" &&
        (!run.expiresAt || new Date(run.expiresAt).getTime() > Date.now());
      const unlocked = run.hintLevels?.[index] ?? ((run.hintedSteps || []).includes(index) ? 3 : 0);
      const hints = revealedHints.get(index) || [];
      const names = [localized("Clue", "ছোট clue"), localized("Guidance", "নির্দেশনা"), localized("Answer", "উত্তর")];
      const controls = [1, 2, 3].map((level) => {
        const paid = level <= unlocked;
        const locked = level > unlocked + 1;
        const cost = run.hintLayerCostsXp?.[index]?.[level - 1] ?? 0;
        const price = paid ? localized("View · free", "দেখুন · বিনামূল্যে")
          : localized(`−${cost} XP${run.hintAccounting === "immediate" ? " now" : " from reward"}`, `−${cost} XP${run.hintAccounting === "immediate" ? " এখন" : " reward থেকে"}`);
        return `<button type="button" class="step-hint-button${paid ? " is-unlocked" : ""}" data-no-translate data-hint-step="${index}" data-hint-level="${level}" aria-expanded="${hints.some((hint) => hint.level === level)}" ${pendingHints.has(index) || locked ? "disabled" : ""}><strong>${localized(`Hint ${level}`, `ইঙ্গিত ${level}`)} · ${names[level - 1]}</strong><span>${G.escapeHtml(pendingHints.has(index) ? localized("Checking…", "যাচাই হচ্ছে…") : price)}</span></button>`;
      }).join("");
      const cards = hints.map((hint) => `<div class="step-hint-card" data-no-translate data-hint-card="${hint.level}" role="status"><strong>${localized(`Hint ${hint.level}`, `ইঙ্গিত ${hint.level}`)} · ${names[hint.level - 1]}</strong><span>${G.escapeHtml(inBangla() ? hint.textBn || hint.text : hint.text)}</span></div>`).join("");
      return `<li class="${stateClass}"><div class="step-body"><div class="step-label">${G.escapeHtml(visibleStepText(step, index))}</div>${active ? `<div class="step-hint-layers" data-no-translate>${controls}</div><div class="step-hint-budget" data-no-translate>${localized(`${unlocked}/3 hints unlocked · step budget ${run.hintCostsXp?.[index] ?? 0} XP`, `${unlocked}/৩ ইঙ্গিত আনলক · ধাপের budget ${run.hintCostsXp?.[index] ?? 0} XP`)}</div>${cards}` : ""}</div></li>`;
    }).join("");
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
    renderHintReward();
    el.status.textContent = G.statusLabel(run.status);
    el.status.className = `tag ${G.statusClass(run.status)}`;
    el.objective.textContent = instructions.objective || "Complete the required Git workflow inside the sandbox.";
    renderMissionProgress();
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
    inputHistory.push(command);
    if (inputHistory.length > 200) inputHistory.shift();
    inputHistoryIndex = null;
    socket.send(JSON.stringify({ type: "input", data: `${command}\r` }));
    el.input.value = "";
  });

  // The command bar follows familiar terminal history behavior as well.
  el.input.addEventListener("keydown", (event) => {
    if (!inputHistory.length) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (inputHistoryIndex == null) inputHistoryIndex = inputHistory.length - 1;
      else inputHistoryIndex = Math.max(0, inputHistoryIndex - 1);
      el.input.value = inputHistory[inputHistoryIndex] || "";
      el.input.setSelectionRange(el.input.value.length, el.input.value.length);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (inputHistoryIndex == null) return;
      if (inputHistoryIndex < inputHistory.length - 1) {
        inputHistoryIndex += 1;
        el.input.value = inputHistory[inputHistoryIndex] || "";
      } else {
        inputHistoryIndex = null;
        el.input.value = "";
      }
      el.input.setSelectionRange(el.input.value.length, el.input.value.length);
    }
  });
  el.interrupt.addEventListener("click", () => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", data: "\u0003" }));
  });
  el.clear.addEventListener("click", () => xterm ? xterm.clear() : (el.output.textContent = ""));
  el.reconnect.addEventListener("click", connect);
  el.steps.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-hint-step]");
    if (!button || !run) return;
    const stepIndex = Number(button.dataset.hintStep);
    const level = Number(button.dataset.hintLevel);
    if (!Number.isInteger(stepIndex) || pendingHints.has(stepIndex)) return;
    pendingHints.add(stepIndex);
    renderMissionProgress();
    try {
      const data = await G.api(`/api/student/mission-runs/${encodeURIComponent(run.id)}/hints/${stepIndex}`, { method: "POST", body: JSON.stringify({ level }) });
      revealedHints.set(stepIndex, data.hints);
      run.hintedSteps = [...new Set([...(run.hintedSteps || []), stepIndex])];
      run.hintLevels ||= [];
      run.hintLevels[stepIndex] = data.hintLevel;
      run.hintPenaltyXp = data.hintPenaltyXp;
      run.hintCostsXp = data.hintCostsXp;
      run.hintLayerCostsXp = data.hintLayerCostsXp;
      run.hintAccounting = data.hintAccounting;
      run.mission.xpReward = data.rewardXp;
      document.querySelectorAll("[data-student-xp]").forEach((node) => node.textContent = `${data.xp} XP`);
      if (data.charged) G.toast(data.hintAccounting === "immediate"
        ? localized(`Hint ${level} unlocked: −${data.costXp} XP now`, `ইঙ্গিত ${level} আনলক: এখন −${data.costXp} XP`)
        : localized(`Hint ${level} unlocked: ${data.costXp} XP less on completion`, `ইঙ্গিত ${level} আনলক: মিশন শেষে ${data.costXp} XP কম পাওয়া যাবে`), "success");
    } catch (error) {
      G.toast(error.message, "error");
    } finally {
      pendingHints.delete(stepIndex);
      renderMissionProgress();
      renderHintReward();
    }
  });
  el.reset.addEventListener("click", async () => {
    if (!confirm("Reset this mission workspace? All current mission files will be removed.")) return;
    try {
      disconnect();
      const data = await G.api(`/api/student/mission-runs/${run.id}/reset`, { method: "POST" });
      run = data.run;
      sandbox = data.sandbox;
      revealedHints.clear();
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
  document.addEventListener("gitstack:languagechange", () => {
    if (run) { renderMissionProgress(); renderHintReward(); }
  });

  initTerminal();
  try { await loadRun(); } catch (error) { G.toast(error.message, "error"); append(`\r\n[error] ${error.message}\r\n`); }
})();
