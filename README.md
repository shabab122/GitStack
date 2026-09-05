# GitStack v15 — Bilingual Responsive Dashboards on the Stable v14 Base

GitStack is a mission-based Git learning and collaboration platform. Version 14 preserves the complete v13 Student Dashboard, encrypted accounts, PostgreSQL/Prisma data layer, automatic individual assessment, XP/progress and browser-integrated Docker sandbox, then adds **Instructor Dashboard V1** with real backend and database integration.

GitStack v15 is a careful UI/UX update built directly on the stable v14 codebase. It keeps the existing backend, PostgreSQL/Prisma schema, authentication, encrypted accounts, student/instructor workflows and Docker sandbox intact while adding dashboard-wide EN/BN switching, a more responsive glassmorphism dashboard presentation, removal of the in-dashboard Public Site shortcut, and secure returning-account login assistance using the browser password manager.

## V15 interface updates

- EN/BN selector added to all 7 student dashboard pages and all 10 instructor dashboard pages.
- The existing `public/language.js` is extended rather than replaced; language preference persists in `localStorage`.
- Dynamic dashboard content inserted after API calls is translated through a mutation-aware language layer.
- Student/instructor sidebars now contain only Logout in their account action area; the Public Site shortcut is removed.
- Shared `public/dashboard-v15.css` adds responsive glassmorphism, improved cards/forms, focus states, hover/click feedback and mobile navigation polish without replacing the V14 dashboard styles.
- Login remembers only the last account identifier/name locally. Passwords are never stored by GitStack in localStorage/sessionStorage. When supported, the browser Credential Management / password-manager flow can securely fill the saved password after the returning-account suggestion is selected.
- No V15 database migration is required.

> **Upgrading from V14:** copy the same working V14 `.env` into V15 before startup so the existing `DATA_ENCRYPTION_KEY` remains unchanged and previously encrypted users stay readable.

## Completed foundation preserved

- Student and instructor registration/login
- Role-based access control
- JWT session in an HttpOnly cookie
- Argon2id password hashing
- AES-256-GCM encryption for sensitive student **and instructor** profile fields
- PostgreSQL + Prisma migrations
- Student Dashboard V1
- Individual missions, repository-state assessment, Bangla feedback and XP
- Complete Docker Sandbox V1
- Authenticated WebSocket browser terminal
- Sandbox lifecycle, ownership, resource limits and cleanup

## New Instructor Dashboard V1

- Instructor signup redirects directly to Instructor Dashboard
- Instructor login redirects directly to Instructor Dashboard
- Role-protected instructor API namespace
- Overview with real student, team, assignment and assessment data
- Student directory with search/filter and per-student progress report
- Predefined mission catalogue and performance summary
- Direct student mission assignments with start/due dates and status
- Three-person team creation and editing
- One unique role per team member:
  - Feature Developer
  - Test Developer
  - Code Reviewer
- Team mission assignment foundation
- Assessment review and failed-check visibility
- MVP-level progress analytics and common workflow mistakes
- Recent activity feed from registrations, missions, assignments and sandboxes
- Encrypted instructor profile update and password change
- Student dashboard surfaces active instructor assignments

## Important scope boundary

The project plan explicitly excludes an arbitrary mission-builder and says GitStack should use Gitea's real Pull Request/review interfaces. Therefore v14 manages **predefined missions** rather than inventing a custom mission editor.

The team-management and collaborative-mission foundation is complete, but these items intentionally remain for the next Gitea phase:

- Gitea repository provisioning
- Real remote team clone/push/pull
- Issues and Pull Requests
- Review comments / requested changes / approvals
- Webhook collection
- Controlled merge conflict
- Team workflow scoring

## Architecture now

```text
Student / Instructor register or login
              ↓
      Role-specific dashboard
              ↓
       Express REST API
              ↓
         PostgreSQL
      ↙                 ↘
Student MissionRun    Instructor management
      ↓                 ↓
SandboxSession       Teams / Assignments
      ↓
Docker container ↔ WebSocket browser terminal
      ↓
Repository-state validator
      ↓
Assessment + Bangla feedback + XP
```

## First-time setup / upgrade

> **Upgrading from the working v13 database?** Copy the old v13 `.env` into the v14 folder **before** running setup. Keep the same `DATA_ENCRYPTION_KEY`; otherwise previously encrypted user profiles cannot be decrypted. The ZIP intentionally excludes `.env`.

```bash
cd GitStack-v15
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl enable --now docker
npm install
npm run setup -- --rebuild
npm run dev
```

Open:

```text
http://localhost:3000
http://localhost:3000/student-dashboard.html
http://localhost:3000/instructor-dashboard.html
http://localhost:3000/sandbox-terminal.html
```

`npm run setup -- --rebuild` checks both dashboards, builds/tests the sandbox, starts PostgreSQL, applies migrations, encrypts legacy user rows and seeds mission templates.

## Daily startup

```bash
cd GitStack-v15
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
npm run project:start
```

## Verification

```bash
npm run check
npm run student:test
npm run instructor:test
npm run terminal:test
npm run sandbox:doctor
npm run sandbox:test
npx prisma migrate status
```

Broader verification:

```bash
npm run verify
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

## Instructor API

```http
GET    /api/instructor/dashboard
GET    /api/instructor/students
GET    /api/instructor/students/:id
GET    /api/instructor/missions
GET    /api/instructor/assignments
POST   /api/instructor/assignments
PATCH  /api/instructor/assignments/:id
DELETE /api/instructor/assignments/:id
GET    /api/instructor/teams
POST   /api/instructor/teams
PATCH  /api/instructor/teams/:id
DELETE /api/instructor/teams/:id
GET    /api/instructor/assessments
GET    /api/instructor/analytics
GET    /api/instructor/activity
GET    /api/instructor/profile
PATCH  /api/instructor/profile
POST   /api/instructor/profile/password
```

All endpoints above require an authenticated `INSTRUCTOR` or `ADMIN` role.

## Database changes in v14

Migration:

```text
20260807190000_instructor_dashboard
```

Adds:

- `Team.createdById` — tracks the instructor who created a team
- `Assignment.studentId` — supports direct student mission assignment

Existing v13 data remains compatible. Existing teams can remain without a creator; new instructor-created teams are owned by their instructor.

## Security

- Passwords: Argon2id hashes
- Sensitive profile data: AES-256-GCM encryption
- Email / university-ID lookup: keyed HMAC
- Session: signed JWT in HttpOnly SameSite cookie
- Student and instructor APIs enforce backend role authorization
- Docker sandbox remains non-root and resource-limited
- Student container cannot access host Docker socket

> Preserve `DATA_ENCRYPTION_KEY` in `.env`. Changing it after user data is encrypted will make existing encrypted profile fields unreadable.

## Documentation

- `RUN_COMMANDS.md`
- `docs/INSTRUCTOR_DASHBOARD_COMPLETE.md`
- `docs/UPGRADE_FROM_V13.md`
- `docs/V14_INTEGRATION_REPORT.md`
- `docs/PROJECT_PLAN_REFERENCE.txt`
- Existing student and sandbox documentation remains included.

## Next milestone

**Gitea + Collaboration Infrastructure**: provision repositories for instructor-created teams, connect sandbox collaboration networking, collect Gitea events/webhooks, and validate issue → branch → commit → PR → review → tests → merge → controlled conflict workflow.
