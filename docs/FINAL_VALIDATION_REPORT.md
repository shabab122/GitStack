# GitStack v1.0.0 — Final Validation Report

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
  - syntax checks for 74 JavaScript files
  - UI checks for 19 dashboard pages / 28 HTML pages
  - feature checks across 28 HTML pages
  - student dashboard checks
  - instructor dashboard checks
  - collaboration source and behavior checks

npx prisma validate
npx prisma generate
npm ls --depth=0
node --check scripts/final-acceptance.js
```

The package was also scanned to ensure the Gitea tokens exposed during development are not present in the final source. `.env` and `node_modules` are intentionally excluded from the release archive.

## Host acceptance

The build environment used to create this archive does not provide a Docker CLI/daemon, so the infrastructure-dependent acceptance test cannot be executed here. A complete host checker is included for the Ubuntu machine that actually runs GitStack.

After copying `.env.example` to `.env`, completing setup and inserting a valid Gitea administrator token, run:

```bash
npm install
npm run setup -- --rebuild
# Complete first-time Gitea account/token setup if required, update .env, then:
npm run acceptance:host
```

The checker validates Docker/Compose, PostgreSQL, Prisma migrations, sandbox image/runtime, WebSocket framing, Gitea API permissions, and the live GitStack `/api/health` endpoint. A successful run ends with:

```text
GitStack FINAL HOST ACCEPTANCE: PASSED
```
