import { AFTER, STEPS, sceneFor } from "./git-command-visualizer-data.js";

const G = window.GitStackStudent;
const ui = {
  studio: document.getElementById("commandStudio"), guard: document.getElementById("commandGuard"),
  list: document.getElementById("commandStepList"), machine: document.getElementById("commandMachine"),
  play: document.getElementById("tourButton"), previous: document.getElementById("previousButton"),
  next: document.getElementById("nextButton"), restart: document.getElementById("restartButton"),
  sound: document.getElementById("soundButton"), counter: document.getElementById("stepCounter"),
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
  soundOn: ["Sound on", "শব্দ চালু"],
  soundOff: ["Sound off", "শব্দ বন্ধ"],
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
  noRemote: ["No remote commits", "রিমোটে commit নেই"],
  noRepo: ["No Git repository yet", "এখনো Git রিপো নেই"],
  noCommits: ["Repository ready · no commits yet", "রিপো তৈরি · এখনো commit নেই"],
  noStaged: ["Nothing staged yet", "staging-এ কোনো ফাইল নেই"],
  noFiles: ["No files in this example folder", "এই উদাহরণের ফোল্ডারে কোনো ফাইল নেই"],
  modified: ["modified", "পরিবর্তিত"],
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
let audioContext;
let storageKey = "";
const timers = new Set();
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

function bn() { return window.GitStackLanguage?.getLanguage?.() === "bn"; }
function t(pair) { return pair[bn() ? 1 : 0]; }
function localized(key) { return t(copy[key]); }

function schedule(callback, milliseconds) {
  const id = window.setTimeout(() => { timers.delete(id); callback(); }, milliseconds);
  timers.add(id);
}

function clearTimers() {
  for (const id of timers) window.clearTimeout(id);
  timers.clear();
}

function beep(type = "step") {
  if (!soundEnabled) return;
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
      gain.gain.exponentialRampToValueAtTime(.028, start + .012);
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

function drawGraph(svg, count, main, feature, remote, repo) {
  svg.replaceChildren();
  if (!count) {
    svg.append(svgNode("text", { x: 26, y: 69, class: "command-graph-empty" },
      remote ? localized("noRemote") : repo ? localized("noCommits") : localized("noRepo")));
    svg.setAttribute("aria-label", remote ? localized("noRemote") : repo ? localized("noCommits") : localized("noRepo"));
    return;
  }

  const x = (i) => 42 + i * 88;
  const trunk = feature >= 0 && feature === count - 1 && main < feature ? main + 1 : count;
  svg.append(svgNode("path", { d: `M ${x(0)} 63 H ${x(trunk - 1)}`, class: "command-graph-line" }));
  if (trunk < count) {
    svg.append(svgNode("path", { d: `M ${x(trunk - 1)} 63 C ${x(trunk - 1) + 22} 63, ${x(count - 1) - 30} 105, ${x(count - 1)} 105`, class: "command-graph-branch" }));
  }
  for (let i = 0; i < count; i++) {
    const y = trunk < count && i === count - 1 ? 105 : 63;
    const circle = svgNode("circle", { cx: x(i), cy: y, r: 10, class: `command-graph-dot${trunk < count && i === count - 1 ? " is-feature" : ""}${i === main ? " is-head" : ""}` });
    svg.append(circle);
    svg.append(svgNode("text", { x: x(i), y: y + 4, "text-anchor": "middle", class: "command-graph-letter" }, String.fromCharCode(65 + i)));
  }
  if (main >= 0) {
    const tipY = main === count - 1 && trunk < count ? 105 : 63;
    const labelY = tipY === 105 ? 90 : 24;
    svg.append(svgNode("text", { x: x(main), y: labelY, "text-anchor": "middle", class: "command-graph-ref" }, "main"));
  }
  if (feature >= 0) {
    const fx = x(feature);
    const fy = trunk < count && feature === count - 1 ? 105 : 63;
    const labelY = fy === 105 ? 119 : 106;
    svg.append(svgNode("text", { x: fx, y: labelY, "text-anchor": "middle", class: "command-graph-feature-label" }, "feature/login"));
  }
  svg.setAttribute("aria-label", `${remote ? localized("remote") : localized("local")}: ${count} ${count === 1 ? "commit" : "commits"}; main ${main + 1}; ${feature >= 0 ? `feature/login ${feature + 1}` : "no feature branch"}`);
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
    if (!stage && (file.staged || file.modified)) {
      const status = document.createElement("small");
      status.textContent = file.staged ? localized("staged") : localized("modified");
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

function renderScene(scene) {
  drawGraph(ui.remote, scene.remote, scene.remote - 1, -1, true, true);
  drawGraph(ui.local, scene.local, scene.main, scene.feature, false, scene.repo);
  ui.head.textContent = scene.repo ? `HEAD → ${scene.head}` : "—";
  ui.remoteCaption.textContent = `${localized("remoteAt")} ${scene.remote ? String.fromCharCode(64 + scene.remote) : "—"}`;
  ui.localCaption.textContent = `${localized("localAt")} ${scene.main >= 0 ? String.fromCharCode(65 + (scene.head === "main" ? scene.main : scene.feature)) : "—"}`;
  renderFiles(ui.staged, scene.staged, true);
  renderFiles(ui.working, scene.files.map((file) => ({ ...file, staged: scene.staged.includes(file.name) })));
  ui.machine.dataset.repo = scene.repo ? "ready" : "empty";
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
  ui.previous.setAttribute("aria-label", localized("previous"));
  ui.next.setAttribute("aria-label", localized("next"));
  ui.counter.textContent = `${String(index + 1).padStart(2, "0")} / 10`;
  ui.progress.style.width = `${((index + 1) / STEPS.length) * 100}%`;
  ui.progressBar.setAttribute("aria-valuenow", String(index + 1));
}

function renderCopy() {
  document.querySelectorAll("[data-command-i18n]").forEach((el) => {
    if (copy[el.dataset.commandI18n]) el.textContent = localized(el.dataset.commandI18n);
  });
  ui.title.textContent = t(STEPS[index].title);
  ui.description.textContent = t(STEPS[index].description);
  ui.takeaway.textContent = t(STEPS[index].takeaway);
  ui.explainIndex.textContent = String(index + 1).padStart(2, "0");
  ui.output.textContent = t(STEPS[index].output);
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

  renderScene(sceneFor(index, "before"));
  ui.command.textContent = "";
  beep("step");
  let position = 0;
  const typeNext = () => {
    position = Math.min(step.command.length, position + 1);
    ui.command.textContent = step.command.slice(0, position);
    if (position < step.command.length) schedule(typeNext, 24);
    else schedule(() => {
      renderScene(sceneFor(index));
      ui.output.textContent = t(step.output);
      ui.machine.classList.remove("command-update");
      void ui.machine.offsetWidth;
      ui.machine.classList.add("command-update");
      beep("action");
    }, 400);
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
ui.restart.addEventListener("click", () => {
  playing = false;
  paused = false;
  showStep(0);
});
ui.sound.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  try { localStorage.setItem("gitstack-command-sound", soundEnabled ? "on" : "off"); } catch { /* Storage is optional. */ }
  renderButtons();
  if (soundEnabled) beep();
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
