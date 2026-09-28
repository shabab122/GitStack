import { beginRound, chooseRound, giveUp, guessLetter, mistakeLimit, revealExtraHint, visibleWord } from "./git-hangman-engine.js";

const storageKey = "gitstack-hangman-record-v1";
const ui = {
  difficulty: [...document.querySelectorAll("[data-difficulty]")],
  clue: document.getElementById("mainClue"),
  category: document.getElementById("categoryLabel"),
  hintButton: document.getElementById("extraHintButton"),
  hint: document.getElementById("extraHint"),
  word: document.getElementById("wordTiles"),
  drawing: [...document.querySelectorAll(".hangman-drawing [data-stage]")],
  attempts: document.getElementById("attemptCount"),
  message: document.getElementById("gameMessage"),
  form: document.getElementById("guessForm"),
  input: document.getElementById("letterInput"),
  keyboard: document.getElementById("letterKeyboard"),
  giveUp: document.getElementById("giveUpButton"),
  result: document.getElementById("roundResult"),
  resultTitle: document.getElementById("resultTitle"),
  resultAnswer: document.getElementById("resultAnswer"),
  resultFact: document.getElementById("resultFact"),
  next: document.getElementById("nextRoundButton"),
  wins: document.getElementById("winsCount"),
  streak: document.getElementById("streakCount"),
  best: document.getElementById("bestCount")
};

function readRecord() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
    const valid = (number) => Number.isSafeInteger(number) && number >= 0 && number <= 100000 ? number : 0;
    return { wins: valid(saved.wins), streak: valid(saved.streak), best: valid(saved.best) };
  } catch {
    return { wins: 0, streak: 0, best: 0 };
  }
}

let record = readRecord();
let difficulty = "medium";
let round;
let previousTerm = "";
let feedback = ["Choose a letter to begin.", "শুরু করতে একটি অক্ষর বেছে নিন।"];
let surrendered = false;

function bn() { return window.GitStackLanguage?.getLanguage?.() === "bn"; }
function t(english, bangla) { return bn() ? bangla : english; }
function localized(pair) { return pair[bn() ? 1 : 0]; }

function renderWord() {
  const characters = visibleWord(round);
  const fragment = document.createDocumentFragment();
  for (const [index, character] of characters.entries()) {
    const actual = round.entry.term[index];
    const tile = document.createElement("span");
    if (/^[A-Z]$/.test(actual)) {
      tile.className = `word-tile${character ? round.result === "lost" && !round.guessed.includes(actual) ? " missed" : " revealed" : ""}`;
      tile.textContent = character || "\u00a0";
      tile.setAttribute("aria-label", character ? `${t("Letter", "অক্ষর")} ${character}` : t("Hidden letter", "লুকানো অক্ষর"));
    } else {
      tile.className = "word-separator";
      tile.textContent = actual === " " ? "\u00a0" : actual;
      tile.setAttribute("aria-label", actual === " " ? t("Word space", "শব্দের ফাঁক") : t("Hyphen", "হাইফেন"));
    }
    fragment.append(tile);
  }
  ui.word.replaceChildren(fragment);
}

function render() {
  if (!round) return;
  const finished = round.result !== "playing";
  ui.clue.textContent = localized(round.entry.clue);
  const category = round.entry.category;
  const categories = { Fundamentals: "ভিত্তি", Collaboration: "সহযোগিতা", Workflow: "ওয়ার্কফ্লো", Recovery: "পুনরুদ্ধার", History: "ইতিহাস" };
  ui.category.textContent = `· ${bn() ? categories[category] : category}`;
  ui.difficulty.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.difficulty === difficulty)));
  ui.hintButton.disabled = round.hintUsed || finished;
  ui.hintButton.textContent = round.hintUsed ? t("Extra clue shown", "বাড়তি সূত্র দেখা হয়েছে") : t("Show another clue · free", "আরেকটি সূত্র দেখুন · বিনামূল্যে");
  ui.hint.hidden = !round.hintUsed;
  ui.hint.textContent = round.hintUsed ? localized(round.entry.extra) : "";
  renderWord();

  const mistakes = round.mistakes;
  const limit = mistakeLimit(difficulty);
  ui.attempts.textContent = t(`${mistakes} / ${limit} wrong guesses`, `${mistakes} / ${limit}টি ভুল অনুমান`);
  ui.message.textContent = localized(feedback);
  const partsToShow = round.result === "lost" ? 8 : Math.floor((mistakes / limit) * 8);
  ui.drawing.forEach((part) => part.classList.toggle("visible", Number(part.dataset.stage) <= partsToShow));

  for (const button of ui.keyboard.querySelectorAll("button[data-letter]")) {
    const guessed = round.guessed.includes(button.dataset.letter);
    button.disabled = finished || guessed;
    button.classList.toggle("correct", guessed && round.entry.term.includes(button.dataset.letter));
    button.classList.toggle("wrong", guessed && !round.entry.term.includes(button.dataset.letter));
  }
  ui.input.disabled = finished;
  ui.form.querySelector('button[type="submit"]').disabled = finished;
  ui.form.hidden = finished;
  ui.giveUp.hidden = finished;
  ui.result.hidden = !finished;
  ui.result.classList.toggle("lost", round.result === "lost");
  if (finished) {
    ui.resultTitle.textContent = round.result === "won" ? t("Round won!", "রাউন্ড জয়!") : surrendered ? t("Round ended", "রাউন্ড শেষ") : t("Round lost", "রাউন্ড হেরেছেন");
    ui.resultAnswer.textContent = t(`The term was ${round.entry.term}`, `শব্দটি ছিল ${round.entry.term}`);
    ui.resultFact.textContent = localized(round.entry.fact);
  }
  ui.wins.textContent = String(record.wins);
  ui.streak.textContent = String(record.streak);
  ui.best.textContent = String(record.best);
}

function saveResult() {
  if (round.result === "won") {
    record.wins += 1;
    record.streak += 1;
    record.best = Math.max(record.best, record.streak);
  } else {
    record.streak = 0;
  }
  try { sessionStorage.setItem(storageKey, JSON.stringify(record)); } catch { /* Private mode may block storage. */ }
}

function startRound(nextDifficulty = difficulty) {
  difficulty = nextDifficulty;
  const entry = chooseRound(difficulty, previousTerm);
  previousTerm = entry.term;
  round = beginRound(entry, difficulty);
  surrendered = false;
  feedback = ["Choose a letter to begin.", "শুরু করতে একটি অক্ষর বেছে নিন।"];
  ui.input.value = "";
  render();
}

function playLetter(letter) {
  const { round: updated, outcome } = guessLetter(round, letter);
  if (outcome === "invalid") feedback = ["Enter one English letter, A–Z.", "ইংরেজি A–Z থেকে একটি অক্ষর দিন।"];
  else if (outcome === "repeated") feedback = ["You already tried that letter.", "এই অক্ষরটি আগে দিয়েছেন।"];
  else if (outcome === "correct") feedback = ["Nice! That letter is in the term.", "দারুণ! অক্ষরটি শব্দে আছে।"];
  else if (outcome === "wrong") feedback = ["That letter is not in the term.", "অক্ষরটি শব্দে নেই।"];
  else if (outcome === "won") feedback = ["You found the Git term.", "আপনি Git শব্দটি খুঁজে পেয়েছেন।"];
  else if (outcome === "lost") feedback = ["No guesses left. Read the explanation below.", "আর অনুমান বাকি নেই। নিচের ব্যাখ্যাটি পড়ুন।"];
  if (round.result === "playing" && updated.result !== "playing") {
    round = updated;
    saveResult();
  } else round = updated;
  ui.input.value = "";
  render();
  if (round.result === "playing") ui.input.focus();
  else ui.next.focus();
}

for (const character of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.letter = character;
  button.textContent = character;
  button.setAttribute("aria-label", `Guess ${character}`);
  ui.keyboard.append(button);
}

ui.form.addEventListener("submit", (event) => {
  event.preventDefault();
  playLetter(ui.input.value);
});
ui.input.addEventListener("input", () => {
  ui.input.value = ui.input.value.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase();
});
ui.keyboard.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-letter]");
  if (button && !button.disabled) playLetter(button.dataset.letter);
});
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey || !/^[a-z]$/i.test(event.key) || round.result !== "playing") return;
  if (event.target.closest("input, textarea, select, [contenteditable]")) return;
  playLetter(event.key);
});
ui.hintButton.addEventListener("click", () => {
  round = revealExtraHint(round);
  render();
  ui.input.focus();
});
ui.giveUp.addEventListener("click", () => {
  const ended = giveUp(round);
  if (ended === round) return;
  round = ended;
  surrendered = true;
  feedback = ["You can try another Git term.", "আরেকটি Git শব্দ চেষ্টা করতে পারেন।"];
  saveResult();
  render();
  ui.next.focus();
});
ui.next.addEventListener("click", () => {
  startRound();
  ui.input.focus();
});
ui.difficulty.forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.difficulty === difficulty) return;
  startRound(button.dataset.difficulty);
  ui.input.focus();
}));
document.addEventListener("gitstack:languagechange", render);

const navToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
navToggle?.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(open));
});
navLinks?.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    navLinks.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  }
});

startRound();
