// This is a teaching model, not a Git terminal. Every state is a snapshot of
// the pictured example; the application never writes a repository or XP.
export const STEPS = [
  {
    name: "git init", subtitle: ["Start a repo", "রিপো শুরু"], command: "git init", flow: "local",
    title: ["A project becomes a repository", "প্রজেক্ট এখন Git রিপো"],
    description: ["Git creates a hidden .git directory in the current folder. Your existing files stay where they are; no commit exists yet.", "বর্তমান ফোল্ডারে Git একটি লুকানো .git ডিরেক্টরি তৈরি করে। ফাইলগুলো সেখানেই থাকে; এখনো কোনো commit নেই।"],
    takeaway: ["Initialization tracks this folder locally. It does not upload files or create a commit.", "git init শুধু স্থানীয়ভাবে রিপো তৈরি করে। ফাইল আপলোড বা commit করে না।"],
    output: ["Initialized empty Git repository in .git/", ".git/ ফোল্ডারে খালি Git রিপো তৈরি হয়েছে।"]
  },
  {
    name: "git clone", subtitle: ["Copy a repo", "রিপো কপি"], command: "git clone https://example.com/team/app.git", flow: "download",
    title: ["Bring a remote project to your machine", "রিমোট প্রজেক্ট নিজের কম্পিউটারে আনুন"],
    description: ["In a new folder, clone downloads the repository's files, commit history and remote connection. Cloning and init are two different ways to start a local repository.", "নতুন ফোল্ডারে clone রিমোট রিপোর ফাইল, commit history ও remote connection নিয়ে আসে। নতুন রিপো শুরু করতে clone ও init দুটি আলাদা উপায়।"],
    takeaway: ["The local history now matches origin/main. You can work offline and sync later.", "লোকাল history এখন origin/main-এর মতো। অফলাইনে কাজ করে পরে sync করা যায়।"],
    output: ["Cloning into 'app'… done.", "'app' ফোল্ডারে রিপো কপি সম্পন্ন।"]
  },
  {
    name: "git status", subtitle: ["See what changed", "পরিবর্তন দেখুন"], command: "git status", flow: "inspect",
    title: ["See where every change stands", "কোন ফাইল কোন অবস্থায় আছে দেখুন"],
    description: ["After editing app.js, status reports that the file changed but has not been staged. This command only inspects your work.", "app.js বদলানোর পর status জানায় ফাইলটি পরিবর্তিত হয়েছে, কিন্তু staging-এ যায়নি। এই কমান্ড শুধু অবস্থা দেখায়।"],
    takeaway: ["Run status before adding, committing or pushing to avoid surprises.", "add, commit বা push করার আগে status দেখে নিন।"],
    output: ["modified: app.js  (not staged)", "পরিবর্তিত: app.js  (staging-এ নেই)"]
  },
  {
    name: "git add", subtitle: ["Stage changes", "পরিবর্তন প্রস্তুত"], command: "git add app.js", flow: "stage",
    title: ["Choose what goes in the next snapshot", "পরের snapshot-এ কী থাকবে নির্বাচন করুন"],
    description: ["Add places the current version of app.js in the staging area. It does not create a commit and does not publish anything.", "add কমান্ড app.js-এর বর্তমান সংস্করণ staging area-তে রাখে। এটি commit তৈরি বা কিছু প্রকাশ করে না।"],
    takeaway: ["The staging area is your draft for the next commit.", "staging area হলো পরের commit-এর খসড়া।"],
    output: ["app.js is staged for the next commit.", "app.js পরের commit-এর জন্য প্রস্তুত।"]
  },
  {
    name: "git commit", subtitle: ["Save a snapshot", "snapshot সংরক্ষণ"], command: 'git commit -m "Add login"', flow: "commit",
    title: ["Save a snapshot in local history", "লোকাল history-তে snapshot রাখুন"],
    description: ["Commit records the staged version as a new point in history. HEAD and the current branch move to that commit; the staging area becomes clear.", "commit staging-এ রাখা সংস্করণটি history-তে নতুন ধাপ হিসেবে জমা করে। HEAD ও বর্তমান branch সেখানে যায়; staging area খালি হয়।"],
    takeaway: ["A commit lives in your local repository until you push it.", "push না করা পর্যন্ত commit শুধু আপনার লোকাল রিপোতেই থাকে।"],
    output: ['[main c3] Add login', '[main c3] Add login — commit তৈরি']
  },
  {
    name: "git push", subtitle: ["Upload commits", "commit আপলোড"], command: "git push origin main", flow: "upload",
    title: ["Share your commits with the remote", "রিমোট রিপোয় commit পাঠান"],
    description: ["Push transfers local commits that origin/main does not yet have. Teammates can now fetch or pull your new commit.", "push লোকাল রিপোর নতুন commit origin/main-এ পাঠায়। এরপর সতীর্থরা fetch বা pull করে সেটি পেতে পারে।"],
    takeaway: ["Only committed history is pushed; unstaged files stay on your machine.", "শুধু commit করা history push হয়; staging-এর বাইরে থাকা ফাইল লোকালেই থাকে।"],
    output: ["main -> main  (origin updated)", "main -> main  (রিমোট আপডেট হয়েছে)"]
  },
  {
    name: "git pull", subtitle: ["Download commits", "commit নিয়ে আসুন"], command: "git pull origin main", flow: "download",
    title: ["Catch up with your teammates", "সতীর্থদের কাজ নিজের রিপোয় আনুন"],
    description: ["A teammate added a commit to origin/main. Pull fetches it and integrates it into your current branch; here the update is a fast-forward.", "একজন সতীর্থ origin/main-এ নতুন commit দিয়েছেন। pull সেটি এনে বর্তমান branch-এ যুক্ত করে; এখানে fast-forward হয়েছে।"],
    takeaway: ["Pull can require conflict resolution if your local work and remote changes overlap.", "লোকাল ও রিমোট কাজ একই জায়গায় বদলালে pull করার সময় conflict মেটাতে হতে পারে।"],
    output: ["Updating c3..d4  ·  Fast-forward", "c3..d4 আপডেট  ·  Fast-forward"]
  },
  {
    name: "git branch", subtitle: ["Make a branch", "নতুন branch"], command: "git branch feature/login", flow: "branch",
    title: ["Give an idea its own branch", "নতুন কাজের জন্য আলাদা branch"],
    description: ["Branch creates feature/login at the current commit. Your HEAD stays on main until you switch branches.", "branch বর্তমান commit-এ feature/login তৈরি করে। branch বদলানোর আগে HEAD main-এই থাকে।"],
    takeaway: ["Creating a branch adds a pointer; it does not make a new commit or switch your files.", "branch তৈরি মানে একটি নতুন pointer; নতুন commit বা branch switch নয়।"],
    output: ["Created branch feature/login. HEAD is still main.", "feature/login তৈরি হয়েছে। HEAD এখনো main-এ।"]
  },
  {
    name: "git checkout", subtitle: ["Switch branches", "branch বদলান"], command: "git checkout feature/login", flow: "checkout",
    title: ["Move HEAD to your feature branch", "HEAD-কে feature branch-এ নিন"],
    description: ["Checkout switches your active branch to feature/login. Git updates the working files if the two branches differ; here both point to the same commit.", "checkout সক্রিয় branch-কে feature/login-এ বদলায়। branch দুটির ফাইল আলাদা হলে Git working files-ও বদলায়; এখানে দুই branch একই commit-এ আছে।"],
    takeaway: ["Check your branch before you commit. Your next commit belongs to the active branch.", "commit করার আগে branch দেখে নিন। পরের commit সক্রিয় branch-এ যুক্ত হবে।"],
    output: ["Switched to branch 'feature/login'", "'feature/login' branch-এ গিয়েছেন।"]
  },
  {
    name: "git merge", subtitle: ["Join branches", "branch মিলান"], command: "git merge feature/login", flow: "merge",
    title: ["Bring finished work back into main", "শেষ করা কাজ main-এ যুক্ত করুন"],
    description: ["For this final example, a feature commit was created and HEAD was switched back to main first. Merge then moves main to the feature commit in a fast-forward. The remote remains unchanged until a later push.", "শেষ উদাহরণে feature branch-এ একটি commit করা হয়েছে এবং HEAD আবার main-এ নেওয়া হয়েছে। merge এখন fast-forward করে main-কে সেই commit-এ নিয়ে যায়। পরে push না করা পর্যন্ত রিমোট বদলায় না।"],
    takeaway: ["Merge combines branch history locally; it does not automatically push or always avoid conflicts.", "merge লোকাল branch history এক করে; এটি নিজে থেকে push করে না এবং সব সময় conflict-ও এড়ায় না।"],
    output: ["Updating d4..e5  ·  Fast-forward", "d4..e5 আপডেট  ·  Fast-forward"]
  }
];

const WORK = (modified = false, extra = false) => [
  { name: "app.js", modified },
  { name: "README.md", modified: false },
  ...(extra ? [{ name: "ui.css", modified: false }] : [])
];

const state = (remote, local, main, feature, head, staged, files, repo = true) =>
  ({ remote, local, main, feature, head, staged, files, repo });

export const AFTER = [
  state(2, 0, -1, -1, "main", [], [{ name: "scratch.js", modified: false }]),
  state(2, 2, 1, -1, "main", [], WORK()),
  state(2, 2, 1, -1, "main", [], WORK(true)),
  state(2, 2, 1, -1, "main", ["app.js"], WORK(true)),
  state(2, 3, 2, -1, "main", [], WORK()),
  state(3, 3, 2, -1, "main", [], WORK()),
  state(4, 4, 3, -1, "main", [], WORK(false, true)),
  state(4, 4, 3, 3, "main", [], WORK(false, true)),
  state(4, 4, 3, 3, "feature/login", [], WORK(false, true)),
  state(4, 5, 4, 4, "main", [], [...WORK(false, true), { name: "login.js", modified: false }])
];

const before = {
  0: state(2, 0, -1, -1, "main", [], [{ name: "scratch.js", modified: false }], false),
  1: state(2, 0, -1, -1, "main", [], [], false),
  2: state(2, 2, 1, -1, "main", [], WORK(true)),
  6: state(4, 3, 2, -1, "main", [], WORK()),
  9: state(4, 5, 3, 4, "main", [], [...WORK(false, true), { name: "login.js", modified: false }])
};

export function sceneFor(index, phase = "after") {
  if (!Number.isInteger(index) || index < 0 || index >= STEPS.length) throw new RangeError("Unknown Git command step");
  return phase === "before" ? before[index] || AFTER[index - 1] : AFTER[index];
}
