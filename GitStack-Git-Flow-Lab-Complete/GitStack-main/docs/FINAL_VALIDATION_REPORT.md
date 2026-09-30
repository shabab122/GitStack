# GitStack v1.0.0 — Final Validation Report (stability bugfix)

This release is the completed GitStack MVP source package derived from the supplied `GitStack-main.zip` without replacing the established authentication, dashboard, mission, sandbox or team architecture.

## Implemented MVP path

- Student/instructor authentication and role-protected APIs.
- Encrypted sensitive profile fields and Argon2id password hashing.
- Dynamic individual/team missions, progress, XP, history and leaderboard.
- Non-root Docker sandbox and browser terminal.
- Exactly-three-member collaboration teams with Feature Developer, Test Developer and Code Reviewer roles.
- Organization-owned private Gitea repository provisioning and team access synchronization.
- Separate collaboration workspaces and role branches.
- Mission issue, deterministic conflict target and deterministic verification script.
- Signed Gitea webhook processing for issue, branch, push, commit, Pull Request, review, requested changes, approval and merge activity.
- Persisted Git events and collaboration contribution points.
- Deterministic 70-point individual-role + 30-point team-workflow assessment.
- Conflict-resolution/test-evidence validation, Bangla feedback, XP awarding and collaboration reports.
- Student and instructor collaboration UI/API integration.

## Validation performed in the build environment

Passed:

```text
npm run verify
  - syntax checks for 77 JavaScript files
  - UI checks for 19 dashboard pages / 28 HTML pages
  - feature checks across 28 HTML pages
  - student dashboard checks
  - instructor dashboard checks
  - collaboration source and behavior checks

npm run db:validate
npm run terminal:test
npm ls --all --depth=0
```

The example environment file contains placeholders only. For this requested
upgrade archive, the supplied `.env` and `node_modules` are retained. The
supplied `.env` remained byte-identical during the work; no database credential,
encryption key, webhook secret or Gitea token was changed.

## Host acceptance

The build environment used to create this archive does not provide a Docker CLI/daemon, so the infrastructure-dependent acceptance test cannot be executed here. A complete host checker is included for the Ubuntu machine that actually runs GitStack.

For an existing installation, keep the supplied `.env` and run:

```bash
npm install
npm run verify
npm run db:validate
npm run sandbox:build
npm run sandbox:doctor
npm run sandbox:test
npm run terminal:test
npm run project:start
```

These commands do not deploy a migration or seed the database. The optional
`npm run acceptance:host` command does include migration/seed steps and should
only be used when that database operation is intentionally approved.

```text
GitStack FINAL HOST ACCEPTANCE: PASSED
```
