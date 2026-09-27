# Published mission runtime (v33)

New instructor missions are compiled from their ordered steps. The student
terminal checks the active step before executing a command, then checks the
real repository and records successful command evidence for that specific run.
The built-in mission setup and validators remain unchanged.

## Upgrade an existing installation

1. Extract this release into a **new directory**. Keep the old directory and
   the Docker database volumes. Do not run `docker compose down -v`.
2. Copy the existing `.env` into the new `GitStack-main` directory. Keep the
   original `DATABASE_URL`, `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, and Gitea token.
3. From the new directory run `npm ci`, `npm run db:validate`,
   `npm run db:generate`, `npm run db:deploy`,
   `npm run published-runtime:test`, then `npm run dev`.
4. If Docker reports that the sandbox image is missing, run
   `npm run sandbox:build` and restart the server. An untouched old attempt
   with no repository is repaired when its terminal reconnects. Use the
   mission's Reset button for an attempt whose files were already changed.

The ZIP intentionally contains neither `.env` nor `node_modules`. Fresh
`npm ci` restores executable permissions for local tools such as `nodemon`.
This change has no database migration; no `db:seed` is needed for an upgrade.

## Authoring rules

- Write one observable Git action per step, in execution order. For example:
  inspect status, create `README.md`, stage changes, commit, verify clean tree.
- Set the required filename and branch prefix in **Automatic validation rules**
  when a specific name matters. A starter Git commit is excluded from student
  commit counts and commit-message assessment.
- A mission whose first step is `git init` or clone starts without a repository.
  A mission whose first step inspects a repository or creates a feature branch
  starts with a `main` branch and a starter commit. A first step asking for
  pending changes also receives one pending starter file.
- Publication rejects steps that have no runnable action. Drafts can be edited.
  An attempted mission keeps its step contract; create a new mission version
  to change its slug, steps, type, or validation rules.
- Remote clone/push/pull missions need a prepared remote and should currently
  use the team collaboration workflow. The individual mission form does not
  configure a remote source.

## Covered scenarios

`npm run published-runtime:test` exercises two instructor missions matching
the reported repository recovery and feature integration workflows, plus a
student-initialized repository mission. It checks starter setup, command
sequence, 0–100% progress, correction of pending work, and final assessment
using isolated temporary Git repositories. A real Docker/browser run still
requires the host's Docker image, PostgreSQL, and Gitea services.
