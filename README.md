# GitStack v15 — Dynamic Missions, Leaderboards, Teams, Themes, and Bilingual Dashboards

GitStack is a mission-based Git learning and collaboration platform. This v15 build continues from the stable v14 full-stack foundation and preserves the existing Express backend, PostgreSQL/Prisma data layer, encrypted accounts, Student Dashboard, Instructor Dashboard, Docker sandbox, browser WebSocket terminal, individual repository assessment, XP/progress, assignments, and three-person team foundation.

This revision adds the requested ranking/milestone system, instructor-created missions, student-created teams, stronger dashboard styling, Dark/Light mode, and GitStack header branding while keeping the previous EN/BN system and authentication flows intact.

## New in this v15 update

### Student leaderboard and milestone badges

The Student Dashboard now exposes an XP-based ranking using real GitStack student data. The first five ranked students receive milestone badges:

1. Diamond — rank #1
2. Platinum — rank #2
3. Gold — rank #3
4. Silver — rank #4
5. Bronze — rank #5

The ranking is deterministic. XP is the primary ordering factor, followed by completed missions, passed assessments, and account creation time for tie-breaking.

### Instructor leaderboards

The Instructor Dashboard includes:

- **Top Rated** — ranked by XP.
- **Top Contributors** — ranked by verified platform activity rather than fake/demo values.

Current contribution score:

```text
20 × unique completed missions
+ 10 × passed assessments
+ 2 × attempts (capped at 25 attempts)
+ 2 × missions currently in progress
```

### Dynamic instructor missions

Instructors can create and manage custom mission templates instead of being limited to seed/predefined missions. A custom mission can include:

- title and slug
- description
- mission type (`INDIVIDUAL` or `TEAM`)
- level
- XP reward
- estimated duration
- objective
- ordered mission steps
- publish/unpublish state
- repository-state validation rules

Supported generic individual validation rules include repository initialization, required file, tracked-file requirement, minimum commit count, minimum commit-message length, required branch prefix, required finishing branch, and clean working tree.

Built-in seed missions remain read-only so existing sandbox setup and specialized validation cannot be accidentally damaged. Custom missions with assignment/attempt history cannot be deleted; they should be unpublished instead.

### Command suggestions removed

The Student Mission interface no longer exposes suggested Git commands. Students receive objectives and steps but must decide which Git commands to use.

### Student-created teams

Students can form their own three-person team using currently available students. The team must contain:

- one Feature Developer
- one Test Developer
- one Code Reviewer

Instructor-created teams remain supported. Instructors can distinguish student-formed teams and can use XP/contribution evidence while evaluating students for teams.

> Current limitation: student-created teams are created immediately after selection; a separate invitation/acceptance workflow is not implemented yet.

### Dark / Light theme and branding

All existing HTML pages load the shared theme layer:

- `public/theme.css`
- `public/theme.js`

Theme preference is persisted locally. Dashboard headers also show GitStack branding/logo while preserving existing navigation and role controls.

### EN / BN support

The existing `public/language.js` remains the single language system. Student and Instructor dashboard pages retain the EN/BN selector, including important new leaderboard, mission, team, badge, and theme labels.

### Dashboard readability and interaction polish

The v15 dashboard layer improves text contrast, card readability, buttons, hover/focus/active states, shadows, spacing, and dark-theme support while preserving the underlying v14 layout and functionality.

## Preserved foundation

- Student and Instructor signup/login/logout
- JWT authentication in HttpOnly SameSite cookie
- role-protected Student and Instructor APIs
- Argon2id password hashing
- AES-256-GCM encryption for sensitive profile fields
- keyed lookup hashes for email/university ID
- PostgreSQL + Prisma
- Student Dashboard and Instructor Dashboard
- individual missions and MissionRun history
- automatic repository-state assessment
- feedback and XP/progress
- instructor assignments
- three-person team management
- Docker sandbox lifecycle and resource limits
- authenticated WebSocket browser terminal
- non-root student container and `/workspace`

## Database change in this revision

Migration:

```text
20260909224500_dynamic_missions
```

It adds nullable `MissionTemplate.createdById` and its relation/index so custom missions can be owned by the Instructor/Admin who created them. Existing built-in missions remain compatible because `createdById` is nullable.

A Prisma schema diff against the previous v15 schema produces exactly this change: one column, one index, and one foreign key.

## Important upgrade rule

If you already have working GitStack data, copy the **same `.env` from your previous working version** into this v15 folder before running setup. In particular, preserve:

```text
DATA_ENCRYPTION_KEY
```

Changing this value makes previously encrypted student/instructor profile fields unreadable.

The setup script now detects an existing `gitstack-postgres` container and refuses to silently create/replace the encryption key when `.env` or `DATA_ENCRYPTION_KEY` is missing.

## First-time / upgrade setup

```bash
cd GitStack-v15
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl enable --now docker
npm install
```

For an upgrade, copy your previous `.env` now, then run:

```bash
npm run setup -- --rebuild
```

Or run the important database steps explicitly:

```bash
docker start gitstack-postgres 2>/dev/null || docker compose up -d postgres
npm run db:validate
npm run db:generate
npm run db:deploy
npx prisma migrate status
npm run db:seed
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
http://localhost:3000/student-dashboard.html
http://localhost:3000/instructor-dashboard.html
http://localhost:3000/sandbox-terminal.html
```

## Verification commands

Source/UI/feature verification:

```bash
npm run check
npm run ui:test
npm run feature:test
npm run student:test
npm run instructor:test
npm run terminal:test
npm run db:validate
```

Docker verification on the Ubuntu host:

```bash
npm run sandbox:doctor
npm run sandbox:test
```

Full project verification:

```bash
npm run verify
```

Database verification:

```bash
npm run db:deploy
npx prisma migrate status
```

## Student pages

```text
/student-dashboard.html
/student-missions.html
/student-mission.html
/student-progress.html
/student-assessment.html
/student-team.html
/student-profile.html
```

## Instructor pages

```text
/instructor-dashboard.html
/instructor-students.html
/instructor-student.html?id=<student-id>
/instructor-missions.html
/instructor-assignments.html
/instructor-teams.html
/instructor-assessments.html
/instructor-analytics.html
/instructor-activity.html
/instructor-profile.html
```

## New/expanded API surfaces

Instructor:

```http
GET    /api/instructor/leaderboard
GET    /api/instructor/missions
POST   /api/instructor/missions
PATCH  /api/instructor/missions/:id
DELETE /api/instructor/missions/:id
GET    /api/instructor/teams
POST   /api/instructor/teams
PATCH  /api/instructor/teams/:id
DELETE /api/instructor/teams/:id
```

Student:

```http
GET  /api/student/leaderboard
GET  /api/student/team/candidates
POST /api/student/team
GET  /api/student/team
```

All of these routes remain protected by the existing authenticated role middleware.

## Remaining collaboration phase

This v15 still does **not** implement the final Gitea-backed collaboration engine. The next major phase remains:

- Gitea service/API integration
- automatic team repository provisioning
- sandbox-to-Gitea private networking
- real remote clone/pull/push
- Issues and Pull Requests
- review/request-changes/approval/merge events
- Gitea webhooks
- controlled merge-conflict mission
- individual/team collaboration assessment and scoring

Custom TEAM missions can be created/assigned as planning objects, but full execution requires the future Gitea collaboration phase.

## Security notes

- GitStack does not store plaintext passwords in localStorage/sessionStorage.
- Returning-account login assistance remembers only safe account identity metadata; password autofill is delegated to the browser/password manager when supported.
- Sensitive database profile fields remain encrypted.
- Student Docker containers remain non-root and cannot access the host Docker socket.
- `.env`, `node_modules`, caches, logs, and temporary/generated content are intentionally excluded from release archives.

## Contributing

Contributions that improve GitStack's learning experience, documentation, accessibility, and reliability are welcome.

Before opening a pull request:

1. Create a dedicated branch from `main`.
2. Keep the change focused and update related documentation.
3. Test the affected functionality locally.
4. Use a clear commit message.
5. Describe the problem and solution in the pull request.
