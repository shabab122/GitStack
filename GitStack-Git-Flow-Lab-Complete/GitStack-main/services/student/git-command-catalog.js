// Shared Git command knowledge for mission-aware terminal validation.
//
// This catalog describes Git porcelain/end-user command families. Mission
// relevance is still determined by the active step; a command being valid Git
// never means it automatically advances the mission.

const READ_ONLY = new Set([
  "blame", "branch-list", "cat-file", "config-read", "count-objects", "describe",
  "diff", "diff-tree", "difftool", "for-each-ref", "fsck", "grep", "help",
  "log", "ls-files", "ls-remote", "reflog", "remote-list", "rev-list",
  "rev-parse", "shortlog", "show", "show-branch", "status", "tag-list",
  "verify-commit", "verify-tag", "whatchanged", "worktree-list"
]);

const MUTATING = new Set([
  "add", "am", "apply", "archive", "bisect", "branch-create", "branch-delete",
  "bundle", "checkout-path", "branch-switch", "cherry-pick", "clean", "clone",
  "commit", "config-write", "fetch", "format-patch", "gc", "init", "maintenance",
  "merge", "mergetool", "mv", "notes", "prune", "pull", "push", "rebase",
  "remote-manage", "repack", "replace", "request-pull", "reset", "restore",
  "revert", "rm", "sparse-checkout", "stash", "submodule", "tag-create",
  "tag-delete", "worktree-manage"
]);

export function isReadOnlyGitKind(kind) { return READ_ONLY.has(kind); }
export function isMutatingGitKind(kind) { return MUTATING.has(kind); }
export function isKnownGitKind(kind) { return READ_ONLY.has(kind) || MUTATING.has(kind); }

export function catalogGitSubcommand(subcommand, args = "") {
  const sub = String(subcommand || "").toLowerCase();
  const rest = String(args || "").trim();

  if (sub === "branch") {
    if (!rest || /^(?:-a|-r|-v|-vv|--all|--remotes|--list|-l|--show-current)(?:\s|$)/.test(rest)) return "branch-list";
    if (/^(?:-d|-D|--delete)\s+/.test(rest)) return "branch-delete";
    return "branch-create";
  }
  if (sub === "tag") {
    if (!rest || /^(?:-l|--list|-n)(?:\s|$)/.test(rest)) return "tag-list";
    if (/^(?:-d|--delete)\s+/.test(rest)) return "tag-delete";
    return "tag-create";
  }
  if (sub === "remote") {
    if (!rest || /^(?:-v|--verbose|show)(?:\s|$)/.test(rest)) return "remote-list";
    return "remote-manage";
  }
  if (sub === "config") {
    if (!rest || /^(?:-l|--list|--get|--get-all|--get-regexp|--show-origin|--show-scope)(?:\s|$)/.test(rest)) return "config-read";
    return "config-write";
  }
  if (sub === "worktree") {
    if (/^list(?:\s|$)/.test(rest)) return "worktree-list";
    return "worktree-manage";
  }
  if (sub === "checkout") {
    if (/^(?:--|\S+\s+--)\s+/.test(rest)) return "checkout-path";
    return "branch-switch";
  }

  const direct = new Map([
    ["add","add"],["am","am"],["apply","apply"],["archive","archive"],
    ["bisect","bisect"],["blame","blame"],["bundle","bundle"],
    ["cat-file","cat-file"],["cherry-pick","cherry-pick"],["clean","clean"],
    ["clone","clone"],["commit","commit"],["count-objects","count-objects"],
    ["describe","describe"],["diff","diff"],["diff-tree","diff-tree"],
    ["difftool","difftool"],["fetch","fetch"],["for-each-ref","for-each-ref"],
    ["format-patch","format-patch"],["fsck","fsck"],["gc","gc"],["grep","grep"],
    ["help","help"],["init","init"],["log","log"],["ls-files","ls-files"],
    ["ls-remote","ls-remote"],["maintenance","maintenance"],["merge","merge"],
    ["mergetool","mergetool"],["mv","mv"],["notes","notes"],["prune","prune"],
    ["pull","pull"],["push","push"],["rebase","rebase"],["reflog","reflog"],
    ["repack","repack"],["replace","replace"],["request-pull","request-pull"],
    ["reset","reset"],["restore","restore"],["revert","revert"],["rev-list","rev-list"],
    ["rev-parse","rev-parse"],["rm","rm"],["shortlog","shortlog"],["show","show"],
    ["show-branch","show-branch"],["sparse-checkout","sparse-checkout"],
    ["stash","stash"],["status","status"],["submodule","submodule"],["switch","branch-switch"],
    ["verify-commit","verify-commit"],["verify-tag","verify-tag"],["whatchanged","whatchanged"]
  ]);
  return direct.get(sub) || "";
}

export const GIT_MISSION_ACTIONS = Object.freeze({
  init: ["initialize", "initialise", "new git repository", "create repository"],
  clone: ["clone", "copy remote repository"],
  status: ["status", "working tree", "working directory state"],
  diff: ["diff", "difference", "review changes", "inspect changes"],
  add: ["stage", "staging", "add changes"],
  commit: ["commit", "save progress", "record changes", "meaningful message"],
  "branch-create": ["create branch", "new branch", "feature branch", "development branch", "separate development workflow"],
  "branch-switch": ["switch branch", "checkout branch", "return to main", "switch back"],
  "branch-delete": ["delete branch", "remove branch"],
  merge: ["merge", "integrate branch", "integration"],
  rebase: ["rebase"], fetch: ["fetch"], pull: ["pull"], push: ["push", "publish changes"],
  restore: ["restore file", "restore version", "recover file", "discard file change", "committed version"],
  reset: ["reset", "move head", "undo commit"],
  revert: ["revert commit", "undo commit safely"],
  "cherry-pick": ["cherry-pick", "cherry pick"],
  stash: ["stash", "temporarily save changes"],
  "tag-create": ["create tag", "release tag", "version tag"],
  "remote-manage": ["add remote", "configure remote", "set remote", "remote url"],
  "config-write": ["configure git", "set git config", "user.name", "user.email"],
  log: ["history", "commit history"], show: ["show commit", "inspect commit"],
  reflog: ["reflog", "reference history"], grep: ["search repository", "grep"], blame: ["blame", "line history"],
  clean: ["clean untracked", "remove untracked"], rm: ["remove tracked file", "git rm"], mv: ["rename file", "move file", "git mv"],
  submodule: ["submodule"], "worktree-manage": ["worktree"], "sparse-checkout": ["sparse checkout"], bisect: ["bisect", "find bad commit"]
});
