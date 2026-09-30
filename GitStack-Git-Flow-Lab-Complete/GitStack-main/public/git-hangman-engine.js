// Git concepts for the standalone practice game. This module has no API,
// sandbox or XP dependency; mission progress remains authoritative elsewhere.
export const DIFFICULTIES = Object.freeze({ easy: 8, medium: 6, hard: 5 });

export const ROUNDS = Object.freeze([
  { difficulty: "easy", term: "GIT", category: "Fundamentals", clue: ["The version control tool used throughout GitStack.", "GitStack জুড়ে ব্যবহৃত ভার্সন কন্ট্রোল টুল।"], extra: ["Its name has three letters.", "এর নামে তিনটি অক্ষর।"], fact: ["Git records changes to a project over time.", "Git সময়ের সঙ্গে প্রজেক্টের পরিবর্তন সংরক্ষণ করে।"] },
  { difficulty: "easy", term: "ADD", category: "Fundamentals", clue: ["The command that puts selected changes into the staging area.", "নির্বাচিত পরিবর্তন স্টেজিং এরিয়ায় রাখার কমান্ড।"], extra: ["It follows the word git and has three letters.", "git-এর পরে তিন অক্ষরের একটি শব্দ।"], fact: ["git add stages changes; it does not create a commit.", "git add পরিবর্তন স্টেজ করে; কমিট তৈরি করে না।"] },
  { difficulty: "easy", term: "COMMIT", category: "Fundamentals", clue: ["A saved snapshot of staged project changes.", "স্টেজ করা প্রজেক্ট পরিবর্তনের একটি সংরক্ষিত স্ন্যাপশট।"], extra: ["You normally write a message when creating one.", "এটি তৈরির সময় সাধারণত একটি বার্তা লিখতে হয়।"], fact: ["A commit preserves a point in repository history.", "একটি কমিট রিপোজিটরির ইতিহাসের একটি অবস্থা ধরে রাখে।"] },
  { difficulty: "easy", term: "STATUS", category: "Fundamentals", clue: ["A command that shows which files changed and what is staged.", "কোন ফাইল বদলেছে ও কী স্টেজ হয়েছে তা দেখানোর কমান্ড।"], extra: ["It does not change your repository.", "এটি রিপোজিটরিতে কোনো পরিবর্তন করে না।"], fact: ["git status helps you inspect work before staging or committing.", "git status স্টেজ বা কমিটের আগে কাজ যাচাই করতে সাহায্য করে।"] },
  { difficulty: "easy", term: "BRANCH", category: "Fundamentals", clue: ["A separate line of work within one repository.", "একই রিপোজিটরিতে কাজ করার আলাদা পথ।"], extra: ["Feature work often happens on one of these.", "ফিচার নিয়ে কাজ প্রায়ই এমন একটি পথে করা হয়।"], fact: ["Branches let teammates work independently before integration.", "ব্রাঞ্চ টিমকে একীভূত করার আগে আলাদাভাবে কাজ করতে দেয়।"] },
  { difficulty: "easy", term: "CLONE", category: "Fundamentals", clue: ["The operation that copies an existing repository to your machine.", "একটি বিদ্যমান রিপোজিটরির কপি নিজের মেশিনে আনার কাজ।"], extra: ["It often uses a remote URL.", "এতে প্রায়ই রিমোট URL ব্যবহার হয়।"], fact: ["git clone creates a new local copy with the remote configured.", "git clone রিমোট সেট করে একটি নতুন লোকাল কপি তৈরি করে।"] },
  { difficulty: "easy", term: "PUSH", category: "Fundamentals", clue: ["Send your local commits to a remote repository.", "লোকাল কমিট রিমোট রিপোজিটরিতে পাঠানো।"], extra: ["This goes from your computer toward the server.", "এটি আপনার কম্পিউটার থেকে সার্ভারের দিকে যায়।"], fact: ["git push publishes commits; teammates can then fetch them.", "git push কমিট প্রকাশ করে; সতীর্থরা সেগুলো fetch করতে পারে।"] },
  { difficulty: "easy", term: "PULL", category: "Fundamentals", clue: ["Download remote updates and integrate them into your current branch.", "রিমোটের আপডেট নামিয়ে বর্তমান ব্রাঞ্চে যুক্ত করা।"], extra: ["It combines a fetch with an integration step.", "এতে fetch-এর সঙ্গে একীভূত করার ধাপ থাকে।"], fact: ["git pull fetches and then merges or rebases, depending on configuration.", "কনফিগারেশন অনুযায়ী git pull fetch-এর পরে merge বা rebase করে।"] },
  { difficulty: "medium", term: "MERGE", category: "Collaboration", clue: ["Integrate the history from one branch into another.", "এক ব্রাঞ্চের ইতিহাস অন্য ব্রাঞ্চে একীভূত করা।"], extra: ["It may create a special commit with two parents.", "এতে দুই parent-যুক্ত বিশেষ কমিট তৈরি হতে পারে।"], fact: ["A merge joins branch histories while preserving their commits.", "Merge আগের কমিট অক্ষত রেখে ব্রাঞ্চের ইতিহাস একত্র করে।"] },
  { difficulty: "medium", term: "REMOTE", category: "Collaboration", clue: ["A named connection to a repository stored elsewhere.", "অন্য কোথাও থাকা রিপোজিটরির নামযুক্ত সংযোগ।"], extra: ["A common default name for one is origin.", "এমন সংযোগের প্রচলিত নাম origin।"], fact: ["A remote is a reference to another repository, often hosted by Gitea.", "রিমোট অন্য রিপোজিটরির ঠিকানা, যা Gitea-তে থাকতে পারে।"] },
  { difficulty: "medium", term: "FETCH", category: "Collaboration", clue: ["Download refs and commits without changing your current branch.", "বর্তমান ব্রাঞ্চ না বদলিয়ে refs ও কমিট নামানো।"], extra: ["Unlike pull, this does not integrate them immediately.", "pull-এর মতো এটি সঙ্গে সঙ্গে একীভূত করে না।"], fact: ["git fetch updates remote tracking refs for later inspection.", "git fetch পরে দেখার জন্য remote tracking refs আপডেট করে।"] },
  { difficulty: "medium", term: "STASH", category: "Workflow", clue: ["Temporarily set aside unfinished working changes.", "অসমাপ্ত কাজের পরিবর্তন সাময়িক সরিয়ে রাখা।"], extra: ["You can bring the saved changes back later.", "সংরক্ষিত পরিবর্তন পরে ফিরিয়ে আনতে পারেন।"], fact: ["A stash is temporary storage; untracked files need an extra option.", "Stash সাময়িক সংরক্ষণ; untracked ফাইলের জন্য বাড়তি option লাগে।"] },
  { difficulty: "medium", term: "REVERT", category: "Recovery", clue: ["Undo a past change by making a new commit.", "নতুন কমিট তৈরি করে পুরোনো পরিবর্তন বাতিল করা।"], extra: ["This keeps the original commit in history.", "এতে পুরোনো কমিট ইতিহাসে থাকে।"], fact: ["git revert preserves shared history while reversing a commit's changes.", "git revert পুরোনো ইতিহাস রেখে একটি কমিটের পরিবর্তন উল্টে দেয়।"] },
  { difficulty: "medium", term: "TAG", category: "Workflow", clue: ["A readable name attached to a particular commit, often a release.", "নির্দিষ্ট কমিটের সঙ্গে যুক্ত পাঠযোগ্য নাম, প্রায়ই কোনো রিলিজের জন্য।"], extra: ["Version labels such as v1.0 are examples.", "v1.0-এর মতো ভার্সন নাম এর উদাহরণ।"], fact: ["Tags usually mark notable points in project history.", "ট্যাগ সাধারণত প্রজেক্টের ইতিহাসে গুরুত্বপূর্ণ স্থান চিহ্নিত করে।"] },
  { difficulty: "medium", term: "ORIGIN", category: "Collaboration", clue: ["The conventional name for the remote created during a clone.", "ক্লোন করার সময় তৈরি হওয়া রিমোটের প্রচলিত নাম।"], extra: ["It is a name, not a special server or branch.", "এটি একটি নাম; বিশেষ সার্ভার বা ব্রাঞ্চ নয়।"], fact: ["origin is only a conventional remote name and can be changed.", "origin কেবল প্রচলিত রিমোট নাম; চাইলে বদলানো যায়।"] },
  { difficulty: "medium", term: "CHECKOUT", category: "Workflow", clue: ["An older command used for both changing branches and restoring paths.", "ব্রাঞ্চ বদলানো ও ফাইল ফিরিয়ে আনা—দুই কাজেই ব্যবহৃত পুরোনো কমান্ড।"], extra: ["Modern Git also offers switch and restore for those jobs.", "এখন ওই কাজের জন্য switch ও restore-ও আছে।"], fact: ["git checkout still works, but switch and restore make the intent clearer.", "git checkout এখনও চলে; switch ও restore কাজের উদ্দেশ্য পরিষ্কার করে।"] },
  { difficulty: "hard", term: "REBASE", category: "History", clue: ["Replay commits on top of a different base commit.", "ভিন্ন ভিত্তি কমিটের ওপর নিজের কমিটগুলো আবার প্রয়োগ করা।"], extra: ["This rewrites the commit identities of the replayed work.", "এতে পুনরায় প্রয়োগ করা কমিটগুলোর পরিচয় বদলায়।"], fact: ["Avoid rebasing shared commits without coordinating with your team.", "টিমকে না জানিয়ে shared কমিট rebase করা এড়িয়ে চলুন।"] },
  { difficulty: "hard", term: "REFLOG", category: "Recovery", clue: ["A local record of where a reference pointed previously.", "কোনো reference আগে কোথায় নির্দেশ করত, তার লোকাল রেকর্ড।"], extra: ["It can help locate a commit after a mistaken reset.", "ভুল reset-এর পর কমিট খুঁজে পেতে কাজে লাগে।"], fact: ["git reflog records local ref movements; it is not shared by push.", "git reflog লোকাল ref-এর চলন রাখে; push দিয়ে তা শেয়ার হয় না।"] },
  { difficulty: "hard", term: "UPSTREAM", category: "Collaboration", clue: ["The remote branch your local branch tracks by default.", "আপনার লোকাল ব্রাঞ্চ যে রিমোট ব্রাঞ্চ ট্র্যাক করে।"], extra: ["Tracking helps pull and push choose a default target.", "ট্র্যাকিং থাকলে pull ও push লক্ষ্য ব্রাঞ্চ ঠিক করতে পারে।"], fact: ["An upstream tracking branch is configured for a local branch.", "লোকাল ব্রাঞ্চের জন্য upstream tracking branch কনফিগার করা হয়।"] },
  { difficulty: "hard", term: "WORKTREE", category: "Workflow", clue: ["A second checkout linked to the same repository data.", "একই রিপোজিটরি ডেটার সঙ্গে যুক্ত আরেকটি checkout।"], extra: ["It allows two branches to be open in separate folders.", "আলাদা ফোল্ডারে দুটি ব্রাঞ্চ খুলে রাখা যায়।"], fact: ["git worktree lets you work in multiple checkouts without cloning again.", "git worktree আবার clone ছাড়াই একাধিক checkout-এ কাজ করতে দেয়।"] },
  { difficulty: "hard", term: "CHERRY-PICK", category: "History", clue: ["Apply one selected commit from another line of history.", "ইতিহাসের অন্য পথ থেকে একটি নির্দিষ্ট কমিট প্রয়োগ করা।"], extra: ["The hyphen appears automatically in this puzzle.", "এই ধাঁধায় হাইফেন আগে থেকেই দেখানো থাকে।"], fact: ["This copies a commit's change onto the current branch as a new commit.", "এটি কোনো কমিটের পরিবর্তন বর্তমান ব্রাঞ্চে নতুন কমিট হিসেবে আনে।"] },
  { difficulty: "hard", term: "DETACHED HEAD", category: "History", clue: ["A state where the current checkout points directly at a commit.", "বর্তমান checkout সরাসরি একটি কমিটের দিকে নির্দেশ করছে এমন অবস্থা।"], extra: ["The space is shown; there are two words.", "ফাঁক দেখানো আছে; উত্তরটি দুটি শব্দ।"], fact: ["Create a branch before making work you want to keep in this state.", "এই অবস্থায় কাজ রাখতে চাইলে আগে একটি ব্রাঞ্চ তৈরি করুন।"] },
  { difficulty: "hard", term: "FAST-FORWARD", category: "History", clue: ["A branch update that moves its pointer ahead without a merge commit.", "merge কমিট ছাড়া ব্রাঞ্চের pointer সামনে এগিয়ে নেওয়া।"], extra: ["It happens when the target branch has no divergent commits.", "লক্ষ্য ব্রাঞ্চে আলাদা কমিট না থাকলে এটি সম্ভব।"], fact: ["Fast-forward integration keeps history linear.", "Fast-forward একীভূতকরণ ইতিহাসকে সরল রেখায় রাখে।"] },
  { difficulty: "hard", term: "CONFLICT", category: "Collaboration", clue: ["A situation where Git cannot automatically combine competing changes.", "প্রতিদ্বন্দ্বী পরিবর্তন Git নিজে একত্র করতে না পারার অবস্থা।"], extra: ["A person must resolve it before integration finishes.", "একীভূতকরণ শেষ হওয়ার আগে কাউকে এটি সমাধান করতে হয়।"], fact: ["After resolving a conflict, stage the corrected file and continue.", "কনফ্লিক্ট মেটানোর পর সংশোধিত ফাইল স্টেজ করে এগোতে হয়।"] }
]);

export function mistakeLimit(difficulty) {
  return DIFFICULTIES[difficulty] || DIFFICULTIES.medium;
}

export function chooseRound(difficulty, previousTerm = "", random = Math.random) {
  const bank = ROUNDS.filter((entry) => entry.difficulty === difficulty && entry.term !== previousTerm);
  if (!bank.length) throw new Error("No Git terms are available for this difficulty.");
  const value = Number(random());
  const index = Math.min(bank.length - 1, Math.max(0, Math.floor((Number.isFinite(value) ? value : 0) * bank.length)));
  return bank[index];
}

export function beginRound(entry, difficulty = entry.difficulty) {
  if (!entry || entry.difficulty !== difficulty || !/^[A-Z -]+$/.test(entry.term)) {
    throw new Error("Invalid Git Hangman round.");
  }
  return { entry, difficulty, guessed: [], mistakes: 0, hintUsed: false, result: "playing" };
}

export function visibleWord(round) {
  return [...round.entry.term].map((character) =>
    /^[A-Z]$/.test(character) && round.result !== "lost" && !round.guessed.includes(character) ? "" : character
  );
}

export function guessLetter(round, input) {
  const letter = String(input || "").trim().toUpperCase();
  if (round.result !== "playing") return { round, outcome: "finished" };
  if (!/^[A-Z]$/.test(letter)) return { round, outcome: "invalid" };
  if (round.guessed.includes(letter)) return { round, outcome: "repeated" };
  const guessed = [...round.guessed, letter];
  const correct = round.entry.term.includes(letter);
  const mistakes = round.mistakes + (correct ? 0 : 1);
  const won = [...round.entry.term].every((character) => !/^[A-Z]$/.test(character) || guessed.includes(character));
  const result = won ? "won" : mistakes >= mistakeLimit(round.difficulty) ? "lost" : "playing";
  return { round: { ...round, guessed, mistakes, result }, outcome: result === "won" ? "won" : result === "lost" ? "lost" : correct ? "correct" : "wrong" };
}

export function revealExtraHint(round) {
  if (round.result !== "playing" || round.hintUsed) return round;
  return { ...round, hintUsed: true };
}

export function giveUp(round) {
  return round.result === "playing" ? { ...round, result: "lost" } : round;
}
