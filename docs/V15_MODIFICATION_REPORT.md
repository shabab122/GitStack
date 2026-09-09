# GitStack V15 Modification Report

## Base version

This V15 update continues the existing GitStack codebase. The working authentication, PostgreSQL/Prisma data layer, student/instructor dashboards, Docker sandbox, mission execution, assessment, XP/progress and WebSocket terminal are preserved.

## Features added in this update

### Student XP leaderboard and milestone badges

The Student Dashboard now includes a Codeforces-inspired XP ranking table backed by real GitStack student data. The first five ranked students receive milestone badges:

1. Diamond
2. Platinum
3. Gold
4. Silver
5. Bronze

Ranks are derived from stored GitStack XP/performance data rather than hard-coded demo users.

### Instructor leaderboards

The Instructor Dashboard now includes two evidence-based views:

- Top Rated — students ordered by XP/rank.
- Top Contributors — students ordered by contribution score calculated from verified GitStack activity.

The leaderboard API also exposes student performance information useful when instructors select students for teams.

### Dynamic instructor-created missions

Instructors can create and manage custom missions instead of relying only on seeded/predefined missions. Custom mission configuration includes title, description, mission type, level, XP reward, estimated duration, objective, steps, publication state and repository-state validation rules.

Built-in system missions remain read-only to avoid breaking established sandbox/validator behavior. Custom individual missions can be automatically assessed with configurable rules such as repository initialization, required file, tracked file, minimum commits, minimum commit-message length, branch prefix, finish branch and clean working tree.

This update adds the nullable `MissionTemplate.createdById` relation and migration:

`prisma/migrations/20260909224500_dynamic_missions/migration.sql`

### Student mission UI cleanup

Command suggestions were removed from the student mission interface, JavaScript and seed data. Mission instructions still describe goals and steps, but students must determine the required Git commands themselves.

### Student-created teams

The existing instructor-created three-person team workflow is preserved. Students can now also form a three-person team from eligible candidates. Instructor views distinguish student-formed teams and show performance evidence such as XP rank and contribution score during team evaluation/selection.

### Dark / light theme and GitStack branding

A persistent theme system is added through `public/theme.js` and `public/theme.css`. Light and dark modes are available throughout the public and authenticated interfaces, and the selected theme is stored locally in the browser. GitStack branding is added to authenticated dashboard headers.

### Text visibility and dashboard polish

Dashboard contrast, labels, cards, controls, ranking tables, badge states and dark-mode readability were improved. Existing V15 responsive/glassmorphism styling remains in place.

### Existing bilingual UI

The existing EN/BN system remains active. New ranking, mission, team, badge and theme labels are integrated into the shared language layer where applicable.

## Security and data behavior

- Existing Argon2id password hashing is preserved.
- Existing AES-256-GCM profile encryption and lookup hashes are preserved.
- Leaderboards use real backend/database data; no fake student accounts are inserted.
- Returning-account login assistance does not persist raw passwords in localStorage/sessionStorage. Password autofill remains a browser/password-manager responsibility.

## Verification completed in the artifact environment

The following checks passed:

- `npm run check` — 65 JavaScript files passed syntax checks.
- `npm run ui:test` — 17 dashboard pages and 26 total HTML pages passed structural/UI checks.
- `npm run student:test` — student dashboard, encrypted profile helpers and mission workflow checks passed.
- `npm run instructor:test` — instructor dashboard, assignments, teams and role-protected workflow checks passed.
- `npm run terminal:test` — WebSocket framing test passed.
- `npm run feature:test` — new V15 leaderboard, badges, mission management, self-form teams and theme checks passed across 26 HTML pages.
- Prisma 6.19.0 schema validation passed with a temporary non-secret `DATABASE_URL` used only for validation.
- Prisma Client generation passed.

## Target-machine verification still required

The artifact environment does not provide access to the user's live Ubuntu Docker daemon or existing PostgreSQL volume, so the following must be run after extraction on the target machine:

1. Copy the existing working `.env` into the project root. Keep the same `DATA_ENCRYPTION_KEY` used by the existing database.
2. Start PostgreSQL/Docker.
3. Run `npm install`.
4. Run `npm run db:generate`.
5. Run `npm run db:deploy` to apply the dynamic-mission migration.
6. Run `npx prisma migrate status`.
7. Run `npm run sandbox:doctor` and `npm run sandbox:test`.
8. Run `npm run dev` and manually verify signup/login, leaderboards, custom mission creation, student-created teams, light/dark mode and browser terminal.

The ZIP intentionally excludes `.env`, dependency folders, caches and logs. `.env.example` is retained.
