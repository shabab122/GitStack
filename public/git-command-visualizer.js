import { AFTER, SETUP, STEPS, TRANSFERS, sceneFor } from "./git-command-visualizer-data.js";

const G = window.GitStackStudent;
const ui = {
  studio: document.getElementById("commandStudio"), guard: document.getElementById("commandGuard"),
  list: document.getElementById("commandStepList"), machine: document.getElementById("commandMachine"),
  play: document.getElementById("tourButton"), previous: document.getElementById("previousButton"),
  next: document.getElementById("nextButton"), restart: document.getElementById("restartButton"),
  sound: document.getElementById("soundButton"), speed: document.getElementById("playbackSpeed"),
  volume: document.getElementById("soundVolume"), volumeValue: document.getElementById("soundVolumeValue"),
  replayCommand: document.getElementById("replayCommand"), setup: document.getElementById("sceneSetup"),
  phase: document.getElementById("scenePhase"), remoteMeta: document.getElementById("remoteMeta"),
  localMeta: document.getElementById("localMeta"), bridge: document.getElementById("modelBridge"),
  directory: document.getElementById("terminalDirectory"),
  counter: document.getElementById("stepCounter"),
  progress: document.getElementById("tourProgress"), progressBar: document.querySelector(".command-progress"),
  command: document.getElementById("terminalCommand"), output: document.getElementById("terminalOutput"),
  remote: document.getElementById("remoteGraph"), local: document.getElementById("localGraph"),
  remoteCaption: document.getElementById("remoteCaption"), localCaption: document.getElementById("localCaption"),
  head: document.getElementById("headBadge"), staged: document.getElementById("stagedFiles"),
  working: document.getElementById("workingFiles"), explainIndex: document.getElementById("explainIndex"),
  title: document.getElementById("explainerTitle"), description: document.getElementById("explainerDescription"),
  takeaway: document.getElementById("explainerTakeaway"), announcement: document.getElementById("commandAnnouncement")
};

const copy = {
  back: ["Back to dashboard", "ড্যাশবোর্ডে ফিরুন"],
  kicker: ["INTERACTIVE GIT VISUALIZER", "ইন্টার‌্যাক্টিভ GIT ভিজুয়ালাইজার"],
  intro: ["Watch your files travel from the working directory to the staging area, local history and remote repository. Explore all ten essential Git commands at your own pace.", "working directory থেকে staging area, local history এবং remote repository-তে ফাইলের যাত্রা দেখুন। নিজের গতিতে ১০টি গুরুত্বপূর্ণ Git কমান্ড শিখুন।"],
  interactive: ["INTERACTIVE WALKTHROUGH", "ইন্টার‌্যাক্টিভ গাইড"],
  simulation: ["A visual simulation · no commands are executed", "শুধু দৃশ্যমান অনুশীলন · কোনো কমান্ড চালানো হয় না"],
  play: ["Play guided tour", "গাইডেড ট্যুর চালু করুন"],
  pause: ["Pause tour", "ট্যুর থামান"],
  resume: ["Resume tour", "ট্যুর চালিয়ে যান"],
  replay: ["Replay tour", "আবার দেখুন"],
  replayCommand: ["Replay command", "কমান্ড আবার দেখুন"],
  before: ["BEFORE COMMAND", "কমান্ডের আগে"],
  after: ["AFTER COMMAND", "কমান্ডের পরে"],
  soundOn: ["Sound on", "শব্দ চালু"],
  soundOff: ["Sound off", "শব্দ বন্ধ"],
  speed: ["Speed", "গতি"],
  volume: ["Volume", "ভলিউম"],
  restart: ["Start over", "শুরু থেকে দেখুন"],
  fieldGuide: ["THE FIELD GUIDE", "কমান্ড গাইড"],
  commands: ["10 Git commands", "১০টি Git কমান্ড"],
  keyboard: ["Use ← and → to switch steps", "ধাপ বদলাতে ← ও → চাপুন"],
  liveModel: ["LIVE MODEL", "লাইভ মডেল"],
  terminal: ["TERMINAL", "টার্মিনাল"],
  remote: ["REMOTE REPOSITORY", "রিমোট রিপোজিটরি"],
  local: ["LOCAL REPOSITORY", "লোকাল রিপোজিটরি"],
  staging: ["STAGING AREA", "স্টেজিং এরিয়া"],
  working: ["WORKING DIRECTORY", "ওয়ার্কিং ডিরেক্টরি"],
  step: ["STEP", "ধাপ"],
  takeaway: ["THE TAKEAWAY", "মনে রাখুন"],
  practiceNote: ["Ready to run real commands? Open a mission and practice inside your isolated sandbox.", "আসল কমান্ড চালাতে চান? নিজের নিরাপদ sandbox-এ মিশন খুলে অনুশীলন করুন।"],
  browseMissions: ["Browse missions ↗", "মিশন দেখুন ↗"],
  previous: ["Previous command", "আগের কমান্ড"],
  next: ["Next command", "পরের কমান্ড"],
  noRemote: ["No remote configured", "কোনো remote configured নেই"],
  exampleRemote: ["Example remote · not connected yet", "উদাহরণের remote · এখনো connected নয়"],
  noRepo: ["No Git repository yet", "এখনো Git রিপো নেই"],
  noCommits: ["Repository ready · no commits yet", "রিপো তৈরি · এখনো commit নেই"],
  noStaged: ["No staged changes · index matches HEAD", "কোনো staged change নেই · index HEAD-এর সঙ্গে মিলে আছে"],
  noIndex: ["No index until a Git repository exists", "Git repository তৈরি হওয়ার আগে index নেই"],
  emptyIndex: ["No staged changes · empty index", "কোনো staged change নেই · index খালি"],
  noFiles: ["No files in this example folder", "এই উদাহরণের ফোল্ডারে কোনো ফাইল নেই"],
  modified: ["modified", "পরিবর্তিত"],
  untracked: ["untracked", "untracked"],
  staged: ["staged", "প্রস্তুত"],
  remoteAt: ["origin/main points to", "origin/main আছে"],
  localAt: ["Current branch points to", "সক্রিয় branch আছে"],
  learning: ["Now learning", "এখন শিখছেন"],
  finished: ["Tour complete. Try a command in a mission when you are ready.", "ট্যুর শেষ। প্রস্তুত হলে মিশনে কমান্ড ব্যবহার করে দেখুন।"],
  audioUnavailable: ["Sound is unavailable in this browser.", "এই ব্রাউজারে শব্দ চালানো যাচ্ছে না।"]
};

let index = 0;
let playing = false;
let paused = false;
let finished = false;
let soundEnabled = true;
let playbackSpeed = 1.5;
let volume = .8;
let audioContext;
let storageKey = "";
const timers = new Set();
const transferAnimations = new Set();
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

function bn() { return window.GitStackLanguage?.getLanguage?.() === "bn"; }
function t(pair) { return pair[bn() ? 1 : 0]; }
function localized(key) { return t(copy[key]); }

function clock() { return window.performance?.now?.() ?? Date.now(); }

function armTimer(timer) {
  timer.startedAt = clock();
  timer.id = window.setTimeout(() => { timers.delete(timer); timer.callback(); }, timer.remaining / playbackSpeed);
}

function schedule(callback, milliseconds) {
  const timer = { callback, remaining: milliseconds, startedAt: 0, id: null };
  timers.add(timer);
  armTimer(timer);
}

function changeSpeed(nextSpeed) {
  if (![1, 1.5, 2].includes(nextSpeed) || nextSpeed === playbackSpeed) return;
  const now = clock();
  for (const animation of transferAnimations) animation.updatePlaybackRate(animation.playbackRate * nextSpeed / playbackSpeed);
  for (const timer of timers) {
    window.clearTimeout(timer.id);
    timer.remaining = Math.max(0, timer.remaining - (now - timer.startedAt) * playbackSpeed);
  }
  playbackSpeed = nextSpeed;
  for (const timer of timers) armTimer(timer);
}

function clearTimers() {
  for (const timer of timers) window.clearTimeout(timer.id);
  timers.clear();
  for (const animation of transferAnimations) animation.cancel();
  transferAnimations.clear();
  ui.machine.querySelectorAll(".command-transfer").forEach((node) => node.remove());
}

function beep(type = "step") {
  if (!soundEnabled || volume === 0) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioContext ||= new Ctx();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    const now = audioContext.currentTime;
    const pitches = type === "complete" ? [523, 659, 784] : type === "action" ? [330, 494] : [392, 523];
    pitches.forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = now + i * .075;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.08 * volume, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .16);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + .17);
    });
  } catch { /* Audio is optional; the animation still works. */ }
}

const SVG = "http://www.w3.org/2000/svg";
function svgNode(tag, attributes = {}, content) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (content != null) node.textContent = content;
  return node;
}

function drawGraph(svg, count, main, feature, remote, repo, head = "", tracking = -1) {
  svg.replaceChildren();
  if (!count) {
    svg.append(svgNode("text", { x: 26, y: 69, class: "command-graph-empty" },
      remote ? localized("noRemote") : repo ? localized("noCommits") : localized("noRepo")));
    svg.setAttribute("aria-label", remote ? localized("noRemote") : repo ? localized("noCommits") : localized("noRepo"));
    return;
  }

  const x = (i) => 42 + i * 88;
  // All commits in this example form one ancestor chain, even while two
  // branches point to different commits. Fast-forward does not add a commit.
  if (count > 1) svg.append(svgNode("path", { d: `M ${x(0)} 65 H ${x(count - 1)}`, class: "command-graph-line" }));
  const active = remote ? -1 : head === "feature/login" ? feature : main;
  for (let i = 0; i < count; i++) {
    const y = 65;
    const circle = svgNode("circle", { cx: x(i), cy: y, r: 10, "data-commit": String.fromCharCode(65 + i), class: `command-graph-dot${i === feature && main !== feature ? " is-feature" : ""}${i === active ? " is-head" : ""}` });
    svg.append(circle);
    svg.append(svgNode("text", { x: x(i), y: y + 4, "text-anchor": "middle", class: "command-graph-letter" }, String.fromCharCode(65 + i)));
  }
  if (main >= 0) {
    svg.append(svgNode("text", { x: x(main), y: 20, "text-anchor": "middle", class: `command-graph-ref${head === "main" ? " is-active-ref" : ""}` }, head === "main" ? "HEAD → main" : "main"));
  }
  if (feature >= 0) {
    const fx = x(feature);
    svg.append(svgNode("text", { x: fx, y: 105, "text-anchor": "middle", class: `command-graph-feature-label${head === "feature/login" ? " is-active-ref" : ""}` }, head === "feature/login" ? "HEAD → feature/login" : "feature/login"));
  }
  if (!remote && tracking >= 0) svg.append(svgNode("text", { x: x(tracking), y: 43, "text-anchor": "middle", class: "command-graph-tracking" }, "origin/main"));
  svg.setAttribute("aria-label", `${remote ? localized("remote") : localized("local")}: ${count} commits; main ${main + 1}; ${feature >= 0 ? `feature/login ${feature + 1}` : "no feature branch"}; ${head ? `HEAD ${head}` : ""}`);
}

function renderFiles(container, files, stage = false) {
  const fragment = document.createDocumentFragment();
  for (const file of files) {
    const chip = document.createElement("span");
    chip.className = `command-file${stage || file.staged ? " is-staged" : file.modified ? " is-modified" : ""}`;
    const dot = document.createElement("span");
    dot.className = "command-file-dot";
    dot.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.textContent = typeof file === "string" ? file : file.name;
    chip.append(dot, name);
    if (file.version || (!stage && (file.staged || file.modified || file.untracked))) {
      const status = document.createElement("small");
      status.textContent = [file.version, file.staged ? localized("staged") : file.modified ? localized("modified") : file.untracked ? localized("untracked") : ""].filter(Boolean).join(" · ");
      chip.append(status);
    }
    fragment.append(chip);
  }
  if (!files.length) {
    const empty = document.createElement("span");
    empty.className = "command-file-empty";
    empty.textContent = localized(stage ? "noStaged" : "noFiles");
    fragment.append(empty);
  }
  container.replaceChildren(fragment);
}

function renderScene(scene, phase = "after") {
  drawGraph(ui.remote, scene.remote, scene.remote - 1, -1, true, true);
  drawGraph(ui.local, scene.local, scene.main, scene.feature, false, scene.repo, scene.head, scene.tracking);
  ui.head.textContent = scene.repo ? `HEAD → ${scene.head}${scene.local ? "" : " (unborn)"}` : "";
  ui.localMeta.textContent = scene.repo ? ".git" : "—";
  ui.remoteMeta.textContent = scene.connected ? "origin / main" : scene.remote ? "example / main" : "—";
  ui.remoteCaption.textContent = !scene.remote ? localized("noRemote") : !scene.connected ? localized("exampleRemote") : `${localized("remoteAt")} ${String.fromCharCode(64 + scene.remote)}`;
  ui.localCaption.textContent = `${localized("localAt")} ${scene.main >= 0 ? String.fromCharCode(65 + (scene.head === "main" ? scene.main : scene.feature)) : "—"}`;
  renderFiles(ui.staged, scene.staged.map((name) => ({ name, version: scene.files.find((file) => file.name === name)?.version })), true);
  if (!scene.repo) ui.staged.firstElementChild.textContent = localized("noIndex");
  else if (!scene.local && !scene.staged.length) ui.staged.firstElementChild.textContent = localized("emptyIndex");
  renderFiles(ui.working, scene.files.map((file) => ({ ...file, staged: scene.staged.includes(file.name) })));
  ui.machine.dataset.repo = scene.repo ? "ready" : "empty";
  ui.machine.dataset.phase = phase;
  ui.directory.textContent = index === 0 ? "~/project" : index === 1 ? "~/projects" : "~/projects/app";
  ui.phase.textContent = localized(phase);
  ui.bridge.classList.toggle("is-disconnected", !scene.connected);
  ui.bridge.querySelector("i").textContent = STEPS[index].flow === "upload" ? "↑" : STEPS[index].flow === "download" ? "↓" : "↕";
}

function animateTransfers(done) {
  const transfers = TRANSFERS[index];
  let position = 0;
  const next = () => {
    const transfer = transfers[position++];
    if (!transfer) { done(); return; }
    const machine = ui.machine.getBoundingClientRect();
    const center = (zone) => {
      const box = ui.machine.querySelector(`[data-zone="${zone}"]`).getBoundingClientRect();
      return { x: box.left + box.width / 2 - machine.left, y: box.top + box.height / 2 - machine.top };
    };
    const from = center(transfer.from), to = center(transfer.to);
    const chip = document.createElement("span");
    chip.className = "command-transfer";
    chip.textContent = t(transfer.label);
    chip.setAttribute("aria-hidden", "true");
    ui.machine.append(chip);
    const transform = ({ x, y }) => `translate(${x - chip.offsetWidth / 2}px,${y - chip.offsetHeight / 2}px)`;
    const animation = chip.animate([
      { transform: transform(from), opacity: .25 },
      { offset: .15, opacity: 1 },
      { transform: transform(to), opacity: 1 }
    ], { duration: 800 / playbackSpeed, easing: "ease-in-out", fill: "forwards" });
    transferAnimations.add(animation);
    schedule(() => { animation.cancel(); transferAnimations.delete(animation); chip.remove(); next(); }, 800);
  };
  if (transfers.length) next();
  else schedule(done, 700);
}

function renderButtons() {
  [...ui.list.children].forEach((button, i) => {
    button.classList.toggle("active", i === index);
    button.setAttribute("aria-current", i === index ? "step" : "false");
    button.querySelector("small").textContent = t(STEPS[i].subtitle);
  });
  ui.previous.disabled = index === 0;
  ui.next.disabled = index === STEPS.length - 1;
  ui.play.querySelector("[data-command-i18n]").dataset.commandI18n = playing ? "pause" : paused ? "resume" : finished ? "replay" : "play";
  ui.play.querySelector(".command-control-symbol").textContent = playing ? "Ⅱ" : "▶";
  ui.play.querySelector("[data-command-i18n]").textContent = localized(playing ? "pause" : paused ? "resume" : finished ? "replay" : "play");
  ui.sound.setAttribute("aria-pressed", String(soundEnabled));
  ui.sound.querySelector("[data-command-i18n]").dataset.commandI18n = soundEnabled ? "soundOn" : "soundOff";
  ui.sound.querySelector("[data-command-i18n]").textContent = localized(soundEnabled ? "soundOn" : "soundOff");
  ui.sound.firstElementChild.textContent = soundEnabled ? "♫" : "×";
  ui.speed.value = String(playbackSpeed);
  ui.volume.value = String(Math.round(volume * 100));
  ui.volumeValue.textContent = `${Math.round(volume * 100)}%`;
  ui.volume.closest(".command-volume-control").classList.toggle("is-muted", !soundEnabled);
  ui.studio.style.setProperty("--flow-update-duration", `${1 / playbackSpeed}s`);
  ui.studio.style.setProperty("--flow-chip-duration", `${.4 / playbackSpeed}s`);
  ui.studio.style.setProperty("--flow-progress-duration", `${.35 / playbackSpeed}s`);
  ui.previous.setAttribute("aria-label", localized("previous"));
  ui.next.setAttribute("aria-label", localized("next"));
  ui.counter.textContent = `${String(index + 1).padStart(2, "0")} / 10`;
  ui.progress.style.width = `${((index + 1) / STEPS.length) * 100}%`;
  ui.progressBar.setAttribute("aria-valuenow", String(index + 1));
  keepActiveCommandVisible();
}

function keepActiveCommandVisible() {
  if (!window.matchMedia("(max-width: 790px)").matches) return;
  const list = ui.list.getBoundingClientRect();
  const active = ui.list.children[index]?.getBoundingClientRect();
  if (active && (active.left < list.left || active.right > list.right)) {
    ui.list.scrollLeft += active.left - list.left - (list.width - active.width) / 2;
  }
}
window.addEventListener("resize", keepActiveCommandVisible);

function renderCopy() {
  document.querySelectorAll("[data-command-i18n]").forEach((el) => {
    if (copy[el.dataset.commandI18n]) el.textContent = localized(el.dataset.commandI18n);
  });
  ui.title.textContent = t(STEPS[index].title);
  ui.description.textContent = t(STEPS[index].description);
  ui.takeaway.textContent = t(STEPS[index].takeaway);
  ui.explainIndex.textContent = String(index + 1).padStart(2, "0");
  ui.output.textContent = t(STEPS[index].output);
  ui.setup.textContent = t(SETUP[index]);
  ui.machine.dataset.flow = STEPS[index].flow;
  renderButtons();
  renderScene(AFTER[index]);
}

function finishTour() {
  playing = false;
  paused = false;
  finished = true;
  renderButtons();
  ui.announcement.textContent = localized("finished");
  beep("complete");
}

function scheduleAdvance() {
  if (!playing) return;
  schedule(() => {
    if (index + 1 === STEPS.length) finishTour();
    else showStep(index + 1, true);
  }, reduceMotion?.matches ? 4800 : 6300);
}

function showStep(nextIndex, animate = true) {
  clearTimers();
  index = nextIndex;
  finished = false;
  const step = STEPS[index];
  ui.machine.classList.remove("command-update");
  ui.machine.dataset.flow = step.flow;
  ui.title.textContent = t(step.title);
  ui.description.textContent = t(step.description);
  ui.takeaway.textContent = t(step.takeaway);
  ui.setup.textContent = t(SETUP[index]);
  ui.explainIndex.textContent = String(index + 1).padStart(2, "0");
  ui.output.textContent = "";
  ui.announcement.textContent = `${localized("learning")} ${step.name}. ${t(step.title)}`;
  renderButtons();
  try { if (storageKey) localStorage.setItem(storageKey, String(index)); } catch { /* Storage is optional. */ }

  if (!animate || reduceMotion?.matches) {
    ui.command.textContent = step.command;
    ui.output.textContent = t(step.output);
    renderScene(sceneFor(index));
    if (playing) scheduleAdvance();
    return;
  }

  renderScene(sceneFor(index, "before"), "before");
  ui.command.textContent = "";
  beep("step");
  let position = 0;
  const typeNext = () => {
    position = Math.min(step.command.length, position + 1);
    ui.command.textContent = step.command.slice(0, position);
    if (position < step.command.length) schedule(typeNext, 24);
    else schedule(() => animateTransfers(() => {
        renderScene(sceneFor(index));
        ui.output.textContent = t(step.output);
        ui.machine.classList.remove("command-update");
        void ui.machine.offsetWidth;
        ui.machine.classList.add("command-update");
        beep("action");
      }), 250);
  };
  typeNext();
  if (playing) scheduleAdvance();
}

for (const [i, step] of STEPS.entries()) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "command-step-button";
  button.innerHTML = `<span class="command-step-number">${String(i + 1).padStart(2, "0")}</span><span class="command-step-copy"><strong></strong><small></small></span><span class="command-step-arrow" aria-hidden="true">›</span>`;
  button.querySelector("strong").textContent = step.name;
  button.querySelector("small").textContent = t(step.subtitle);
  button.addEventListener("click", () => { playing = false; paused = false; showStep(i); });
  ui.list.append(button);
}

ui.play.addEventListener("click", () => {
  if (playing) {
    playing = false;
    paused = true;
    showStep(index, false);
  } else if (paused) {
    playing = true;
    paused = false;
    renderButtons();
    beep();
    scheduleAdvance();
  } else {
    playing = true;
    if (finished) index = 0;
    showStep(index);
  }
});
ui.previous.addEventListener("click", () => {
  if (index > 0) { playing = false; paused = false; showStep(index - 1); }
});
ui.next.addEventListener("click", () => {
  if (index < STEPS.length - 1) { playing = false; paused = false; showStep(index + 1); }
});
ui.replayCommand.addEventListener("click", () => { playing = false; paused = false; showStep(index); });
ui.restart.addEventListener("click", () => {
  playing = false;
  paused = false;
  showStep(0);
});
ui.sound.addEventListener("click", () => {
  if (!soundEnabled && volume === 0) volume = .8;
  soundEnabled = !soundEnabled;
  try {
    localStorage.setItem("gitstack-command-sound", soundEnabled ? "on" : "off");
    localStorage.setItem("gitstack-command-volume", String(volume));
  } catch { /* Storage is optional. */ }
  renderButtons();
  if (soundEnabled) beep();
});
ui.speed.addEventListener("change", () => {
  changeSpeed(Number(ui.speed.value));
  try { localStorage.setItem("gitstack-command-speed", String(playbackSpeed)); } catch { /* Storage is optional. */ }
  renderButtons();
});
ui.volume.addEventListener("input", () => {
  volume = Number(ui.volume.value) / 100;
  soundEnabled = volume > 0;
  try {
    localStorage.setItem("gitstack-command-volume", String(volume));
    localStorage.setItem("gitstack-command-sound", soundEnabled ? "on" : "off");
  } catch { /* Storage is optional. */ }
  renderButtons();
});
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest("input,textarea,select,[contenteditable]")) return;
  if (event.key === "ArrowRight" && index < STEPS.length - 1) {
    event.preventDefault(); playing = false; paused = false; showStep(index + 1);
  } else if (event.key === "ArrowLeft" && index > 0) {
    event.preventDefault(); playing = false; paused = false; showStep(index - 1);
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && playing) { playing = false; paused = true; showStep(index, false); }
});
document.addEventListener("gitstack:languagechange", () => {
  clearTimers();
  ui.command.textContent = STEPS[index].command;
  renderCopy();
  if (playing) scheduleAdvance();
});

try {
  const student = await G.ensureStudent();
  if (student) {
    storageKey = `gitstack-command-step:${student.id}`;
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isInteger(saved) && saved >= 0 && saved < STEPS.length) index = saved;
      soundEnabled = localStorage.getItem("gitstack-command-sound") !== "off";
      const storedSpeed = Number(localStorage.getItem("gitstack-command-speed"));
      if ([1, 1.5, 2].includes(storedSpeed)) playbackSpeed = storedSpeed;
      const storedVolume = localStorage.getItem("gitstack-command-volume");
      if (storedVolume !== null) {
        const parsedVolume = Number(storedVolume);
        if (Number.isFinite(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1) volume = parsedVolume;
      }
      if (volume === 0) soundEnabled = false;
    } catch { /* Private browsing may disable storage. */ }
    document.body.removeAttribute("data-loading");
    ui.guard.hidden = true;
    ui.studio.hidden = false;
    renderCopy();
    ui.command.textContent = STEPS[index].command;
    window.lucide?.createIcons?.();
  }
} catch {
  ui.guard.textContent = "Unable to verify your student session. Please return to the dashboard and try again.";
  const link = document.createElement("a");
  link.href = "student-dashboard.html";
  link.textContent = "Student dashboard";
  ui.guard.append(document.createElement("br"), link);
}
