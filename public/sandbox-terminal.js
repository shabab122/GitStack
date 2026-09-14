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
    clearButton: document.getElementById("clearButton")
  };

  let currentSandbox = null;
  let socket = null;
  let xterm = null;
  let fitAddon = null;

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
    fitAddon?.fit();
    xterm.writeln("Welcome to the GitStack Docker sandbox.");
    xterm.writeln("Log in, create a sandbox, then run Git commands here.\r\n");
    xterm.onData((data) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }));
      }
    });
  }
  const queryMission = new URLSearchParams(location.search).get("mission");

  function appendOutput(text) {
    if (xterm) {
      xterm.write(String(text));
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
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `Request failed (${response.status}).`);
    return body;
  }

  function setConnection(status) {
    elements.connectionPill.textContent = status;
    elements.connectionPill.className = "connection-pill";
    if (status === "Connected") elements.connectionPill.classList.add("connected");
    if (status === "Connecting") elements.connectionPill.classList.add("connecting");
    const connected = status === "Connected";
    elements.terminalInput.disabled = !connected;
    elements.sendButton.disabled = !connected;
    elements.interruptButton.disabled = !connected;
  }

  function renderSandbox() {
    const sandbox = currentSandbox;
    elements.statusValue.textContent = sandbox?.status || "No sandbox";
    elements.sandboxIdValue.textContent = sandbox?.sandboxId || "—";
    elements.modeValue.textContent = sandbox?.mode || "—";
    elements.expiresValue.textContent = sandbox?.expiresAt
      ? new Date(sandbox.expiresAt).toLocaleString()
      : "—";
    const exists = Boolean(sandbox?.sandboxId) && sandbox.status !== "DELETED";
    elements.startButton.disabled = !exists || sandbox.running;
    elements.stopButton.disabled = !exists || !sandbox.running;
    elements.resetButton.disabled = !exists;
    elements.deleteButton.disabled = !exists;
    elements.connectButton.disabled = !exists || !sandbox.running;
    elements.createButton.disabled = exists;
  }

  function disconnectSocket() {
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
    setConnection("Disconnected");
  }

  function connectTerminal() {
    disconnectSocket();
    if (!currentSandbox?.sandboxId || !currentSandbox.running) return;
    setConnection("Connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(
      `${protocol}//${location.host}/ws/sandboxes/${currentSandbox.sandboxId}/terminal`
    );

    socket.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "output") appendOutput(message.data);
      if (message.type === "status" && message.status === "connected") {
        setConnection("Connected");
        fitAddon?.fit();
        if (xterm && socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "resize", columns: xterm.cols, rows: xterm.rows }));
          xterm.focus();
        } else {
          elements.terminalInput.focus();
        }
      }
      if (message.type === "error") appendOutput(`\n[error] ${message.error}\n`);
      if (message.type === "exit") appendOutput(`\n[terminal exited: ${message.exitCode}]\n`);
    };
    socket.onerror = () => appendOutput("\n[terminal connection error]\n");
    socket.onclose = () => {
      socket = null;
      setConnection("Disconnected");
    };
  }

  async function refreshSandbox() {
    if (!currentSandbox?.sandboxId) return;
    const data = await api(`/api/sandboxes/${currentSandbox.sandboxId}`);
    currentSandbox = data.sandbox;
    renderSandbox();
  }

  async function loadInitialData() {
    try {
      const me = await api("/api/auth/me");
      elements.authState.textContent = `Logged in as ${me.user.fullName}`;
      elements.authState.classList.remove("error");
      elements.authState.classList.add("ready");
      elements.authState.style.cursor = "default";
      elements.authState.onclick = null;
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
      elements.authState.textContent = "Please log in first";
      elements.authState.classList.remove("ready");
      elements.authState.classList.add("error");
      elements.authState.style.cursor = "pointer";
      elements.authState.onclick = () => window.location.assign("login.html?role=student");
      elements.createButton.disabled = true;
      appendOutput(`\n${error.message}\nOpen the Login page, then return here.\n`);
    }
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
      const data = await api(`/api/sandboxes/${currentSandbox.sandboxId}/start`, { method: "POST" });
      currentSandbox = data.sandbox;
      renderSandbox();
      connectTerminal();
    } catch (error) { appendOutput(`\n[error] ${error.message}\n`); }
  });

  elements.stopButton.addEventListener("click", async () => {
    try {
      disconnectSocket();
      const data = await api(`/api/sandboxes/${currentSandbox.sandboxId}/stop`, { method: "POST" });
      currentSandbox = data.sandbox;
      renderSandbox();
      appendOutput("\nSandbox stopped. Files remain until reset, delete or expiry.\n");
    } catch (error) { appendOutput(`\n[error] ${error.message}\n`); }
  });

  elements.resetButton.addEventListener("click", async () => {
    if (!confirm("Reset this sandbox? All files in /workspace will be removed.")) return;
    try {
      disconnectSocket();
      const data = await api(`/api/sandboxes/${currentSandbox.sandboxId}/reset`, { method: "POST" });
      currentSandbox = data.sandbox;
      if (xterm) { xterm.clear(); xterm.writeln("Sandbox reset. The workspace is clean.\r\n"); }
      else { elements.terminalOutput.textContent = "Sandbox reset. The workspace is clean.\n"; }
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
    } catch (error) { appendOutput(`\n[error] ${error.message}\n`); }
  });

  elements.connectButton.addEventListener("click", connectTerminal);
  elements.terminalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const command = elements.terminalInput.value;
    if (!command || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "input", data: `${command}\r` }));
    elements.terminalInput.value = "";
  });
  elements.interruptButton.addEventListener("click", () => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "input", data: "\u0003" }));
    }
  });
  elements.clearButton.addEventListener("click", () => {
    if (xterm) xterm.clear();
    else elements.terminalOutput.textContent = "";
  });
  window.addEventListener("resize", () => {
    if (!xterm) return;
    fitAddon?.fit();
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "resize", columns: xterm.cols, rows: xterm.rows }));
    }
  });
  window.addEventListener("beforeunload", disconnectSocket);
  window.addEventListener("focus", () => {
    loadInitialData().catch(() => {});
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadInitialData().catch(() => {});
  });

  loadInitialData();
  if (window.lucide) window.lucide.createIcons();
})();
