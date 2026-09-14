export const SANDBOX_USER = Object.freeze({
  name: "student",
  uid: 10001,
  gid: 10001,
  dockerUser: "10001:10001"
});

export const SANDBOX_WORKDIR = "/workspace";

export const SANDBOX_MODES = Object.freeze({
  isolated: "ISOLATED",
  collaboration: "COLLABORATION"
});

export const SANDBOX_LABELS = Object.freeze({
  managed: "gitstack.managed",
  sandboxId: "gitstack.sandbox-id",
  sessionId: "gitstack.session-id",
  ownerUserId: "gitstack.owner-user-id",
  missionRunId: "gitstack.mission-run-id",
  mode: "gitstack.mode",
  createdAt: "gitstack.created-at",
  expiresAt: "gitstack.expires-at"
});

export const APPROVED_COMMANDS = Object.freeze({
  whoami: Object.freeze(["whoami"]),
  "git-version": Object.freeze(["git", "--version"]),
  pwd: Object.freeze(["pwd"]),
  "list-files": Object.freeze(["ls", "-la"]),
  "git-init": Object.freeze(["git", "init"]),
  "git-status": Object.freeze(["git", "status", "--short", "--branch"]),
  "git-log": Object.freeze(["git", "log", "--oneline", "--decorate", "-10"])
});
