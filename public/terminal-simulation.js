(() => {
  "use strict";

  const SELECTOR = ".terminal-body, .terminal-block pre code";
  const activeAnimations = new Map();
  const observed = new WeakSet();

  const settings = {
    heroDelay: 320,
    blockDelay: 120,
    commandSpeed: 22,
    outputSpeed: 11,
    linePause: 120,
    commandPause: 260
  };

  const sleep = (milliseconds, signal) => new Promise((resolve) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

  function textNodesInside(root) {
    const nodes = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.length) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function terminalSpeed(node) {
    const parent = node.parentElement;
    if (
      parent?.closest(".comment") ||
      parent?.classList.contains("comment") ||
      parent?.classList.contains("output") ||
      parent?.classList.contains("success") ||
      parent?.classList.contains("error") ||
      parent?.classList.contains("reward")
    ) {
      return settings.outputSpeed;
    }

    return settings.commandSpeed;
  }

  function prepareTerminal(terminal) {
    if (!terminal.dataset.terminalSnapshot) {
      terminal.dataset.terminalSnapshot = terminal.innerHTML;
    }

    terminal.innerHTML = terminal.dataset.terminalSnapshot;
    terminal.classList.add("terminal-simulator");
    terminal.setAttribute("aria-live", "polite");

    const nodes = textNodesInside(terminal);
    const records = nodes.map((node) => ({
      node,
      text: node.nodeValue
    }));

    records.forEach(({ node }) => {
      node.nodeValue = "";
    });

    let cursor = terminal.querySelector(".terminal-sim-cursor");
    if (!cursor) {
      cursor = document.createElement("span");
      cursor.className = "terminal-sim-cursor";
      cursor.setAttribute("aria-hidden", "true");
      terminal.appendChild(cursor);
    }

    return records;
  }

  async function typeTerminal(terminal, initialDelay = 0) {
    activeAnimations.get(terminal)?.abort();

    const controller = new AbortController();
    activeAnimations.set(terminal, controller);
    const { signal } = controller;

    terminal.classList.remove("terminal-sim-complete");
    terminal.classList.add("terminal-sim-running");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      terminal.innerHTML = terminal.dataset.terminalSnapshot || terminal.innerHTML;
      terminal.classList.remove("terminal-sim-running");
      terminal.classList.add("terminal-sim-complete");
      return;
    }

    const records = prepareTerminal(terminal);
    await sleep(initialDelay, signal);

    for (const record of records) {
      if (signal.aborted) return;

      const text = record.text;
      if (!text) continue;

      const isWhitespaceOnly = !text.trim();
      if (isWhitespaceOnly) {
        record.node.nodeValue = text;
        if (text.includes("\n")) await sleep(settings.linePause, signal);
        continue;
      }

      const speed = terminalSpeed(record.node);

      for (const character of text) {
        if (signal.aborted) return;
        record.node.nodeValue += character;

        let pause = speed;
        if (character === "\n") pause = settings.linePause;
        else if (/[.!?]/.test(character)) pause = speed * 3;
        else if (character === "$") pause = settings.commandPause;

        await sleep(pause, signal);
      }
    }

    if (signal.aborted) return;

    terminal.classList.remove("terminal-sim-running");
    terminal.classList.add("terminal-sim-complete");
    activeAnimations.delete(terminal);
  }

  function startVisibleTerminal(terminal) {
    const isHero = terminal.classList.contains("terminal-body");
    typeTerminal(
      terminal,
      isHero ? settings.heroDelay : settings.blockDelay
    );
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const terminal = entry.target;
      observer.unobserve(terminal);
      startVisibleTerminal(terminal);
    });
  }, {
    rootMargin: "0px 0px -12% 0px",
    threshold: 0.28
  });

  function registerTerminals() {
    document.querySelectorAll(SELECTOR).forEach((terminal) => {
      if (observed.has(terminal)) return;
      observed.add(terminal);
      terminal.dataset.terminalSnapshot = terminal.innerHTML;
      observer.observe(terminal);
    });
  }

  function restartVisibleTerminals() {
    document.querySelectorAll(SELECTOR).forEach((terminal) => {
      activeAnimations.get(terminal)?.abort();
      terminal.dataset.terminalSnapshot = terminal.innerHTML;
      terminal.classList.remove("terminal-sim-running", "terminal-sim-complete");

      const rect = terminal.getBoundingClientRect();
      const visible = rect.bottom > 0 && rect.top < window.innerHeight;

      if (visible) {
        startVisibleTerminal(terminal);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", registerTerminals);

  document.addEventListener("gitstack:languagechange", () => {
    window.setTimeout(restartVisibleTerminals, 60);
  });

  window.GitStackTerminalSimulation = {
    replayAll() {
      document.querySelectorAll(SELECTOR).forEach((terminal) => {
        terminal.innerHTML = terminal.dataset.terminalSnapshot || terminal.innerHTML;
        startVisibleTerminal(terminal);
      });
    }
  };
})();