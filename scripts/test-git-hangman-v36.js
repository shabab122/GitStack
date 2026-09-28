import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { beginRound, chooseRound, DIFFICULTIES, giveUp, guessLetter, mistakeLimit, revealExtraHint, ROUNDS, visibleWord } from "../public/git-hangman-engine.js";

assert.equal(ROUNDS.length, 24, "all curated Git concepts should be available");
assert.equal(new Set(ROUNDS.map((entry) => entry.term)).size, ROUNDS.length, "terms must not repeat");
for (const entry of ROUNDS) {
  assert(entry.difficulty in DIFFICULTIES);
  assert.match(entry.term, /^[A-Z -]+$/);
  for (const field of ["clue", "extra", "fact"]) {
    assert.equal(entry[field].length, 2, `${entry.term} needs English and Bangla ${field}`);
    assert(entry[field].every((value) => value.length > 10));
  }
}
for (const difficulty of Object.keys(DIFFICULTIES)) {
  assert(ROUNDS.filter((entry) => entry.difficulty === difficulty).length >= 8);
  const first = chooseRound(difficulty, "", () => 0);
  assert.equal(first.difficulty, difficulty);
  assert.notEqual(chooseRound(difficulty, first.term, () => 0).term, first.term);
}

let round = beginRound(ROUNDS.find((entry) => entry.term === "COMMIT"), "easy");
assert.equal(visibleWord(round).join(""), "");
assert.equal(guessLetter(round, "1").outcome, "invalid");
assert.equal(guessLetter(round, "AB").outcome, "invalid");
assert.equal(revealExtraHint(round).hintUsed, true);
assert.equal(revealExtraHint(revealExtraHint(round)).hintUsed, true, "one extra clue per round");
round = guessLetter(round, "c").round;
assert.equal(round.mistakes, 0);
assert.equal(guessLetter(round, "C").outcome, "repeated");
for (const letter of "OMIT") round = guessLetter(round, letter).round;
assert.equal(round.result, "won");
assert.equal(visibleWord(round).join(""), "COMMIT");
assert.equal(guessLetter(round, "Z").outcome, "finished");
assert.equal(giveUp(round), round, "a finished round cannot be changed");

round = beginRound(ROUNDS.find((entry) => entry.term === "CHERRY-PICK"), "hard");
assert.equal(visibleWord(round)[6], "-", "separators are already visible");
for (const letter of "ZQXJV") round = guessLetter(round, letter).round;
assert.equal(round.mistakes, mistakeLimit("hard"));
assert.equal(round.result, "lost");
assert.equal(visibleWord(round).join(""), "CHERRY-PICK", "answers are revealed after losing");
assert.equal(revealExtraHint(round), round, "hints cannot be opened after finishing");
round = beginRound(ROUNDS[0], "easy");
assert.equal(giveUp(round).result, "lost");

const dashboard = readFileSync("public/student-dashboard.html", "utf8");
const terminal = readFileSync("public/sandbox-terminal.html", "utf8");
const team = readFileSync("public/student-team.js", "utf8");
const game = readFileSync("public/git-hangman.html", "utf8");
const gameScript = readFileSync("public/git-hangman.js", "utf8");
assert.match(dashboard, /href="git-hangman\.html"[\s\S]*Git Hangman/);
assert.match(terminal, /terminalContext\.has\(key\)/);
assert.match(terminal, /"mission", "sandbox", "assignment", "collaboration"/);
assert.match(terminal, /location\.replace\("git-hangman\.html"\)/);
assert.match(terminal, /id="terminalNavLink"/);
assert.match(terminal, /link\.href = `sandbox-terminal\.html\$\{location\.search\}`/, "the terminal's own link must retain mission or team context");
const redirectScript = terminal.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert(redirectScript, "the standalone entry redirect should run before the terminal loads");
for (const [search, expected] of [
  ["", "git-hangman.html"],
  ["?anything=1", "git-hangman.html"],
  ["?mission=git-basics", null],
  ["?sandbox=existing", null],
  ["?assignment=team-mission", null],
  ["?collaboration=1", null]
]) {
  let destination = null;
  vm.runInNewContext(redirectScript, { URLSearchParams, document: { addEventListener: () => {} }, location: { search, replace: (path) => { destination = path; } } });
  assert.equal(destination, expected, `unexpected redirect for ${search || "plain terminal URL"}`);
}
assert.match(team, /sandbox-terminal\.html\?sandbox=.*collaboration=1&assignment=/);
assert.match(game, /id="letterInput"[\s\S]*id="letterKeyboard"[\s\S]*id="roundResult"/);
assert.match(gameScript, /sessionStorage\.setItem\(storageKey/);
assert.doesNotMatch(gameScript, /\/api\/|fetch\(|WebSocket|xpAwarded|missionRun/i, "the game must not alter backend missions, sandboxes or XP");
console.log("v36 Git Hangman rules, difficulty, hints, outcomes, navigation isolation and XP separation passed.");
