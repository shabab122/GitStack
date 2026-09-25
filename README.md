# GtStack

> A mission-based Git learning, practice, collaboration, and assessment platform for software engineering education.

GitStack is a full-stack learning platform designed to move students through a realistic Git workflow:

**Learn Git → Practise Safely → Work in Teams → Follow a Real Workflow → Receive Automatic Assessment**

Students complete structured Git missions inside isolated Docker workspaces, receive mission-aware feedback and live progress updates, and later work in real team repositories through Gitea. Instructors can create missions, assign work, manage teams, inspect progress, and review assessment evidence.

---

## Project overview

GitStack is intended for university-level Git and software engineering training where students need more than static tutorials. The platform combines:

- structured learning missions;
- isolated Git practice environments;
- mission-aware command validation;
- live step-by-step progress tracking;
- instructor-created and instructor-assigned missions;
- role-based student/instructor dashboards;
- real team collaboration through Gitea;
- automatic repository/workflow assessment;
- XP, progress history, feedback, and reporting.

Unlike a generic shell, the GitStack terminal understands the active mission. It still executes real Git and shell commands inside a sandbox, but mission progression is controlled by the requirements of the current step.

---

## Core goals

GitStack is designed around five goals:

1. **Teach Git progressively** using practical missions rather than only theory.
2. **Provide a safe practice environment** through isolated Docker sandboxes.
3. **Track mission state accurately** so correct work advances progress and incorrect work does not.
4. **Support real collaboration** through team repositories, branches, Pull Requests, reviews, merges, and signed webhooks.
5. **Provide automatic assessment** from repository state and collaboration evidence.

## Key features

### Student features

- Student registration and login.
- Role-protected student dashboard.
- Mission browsing and mission workspace.
- Instructor-assigned missions.
- Mission progress, XP, assessment, feedback, and history.
- Profile management and Gitea username linking.
- Mission-aware browser terminal.
- Up-arrow command history support.
- Reset, abandon, continue, retry, and submit mission flows.
- Real-time checklist state:
  - completed;
  - current;
  - locked.

### Instructor features

- Instructor registration and login.
- Mission creation and publishing.
- Mission assignment to students.
- Student monitoring.
- Team creation and role assignment.
- Assessment and analytics pages.
- Collaboration activity review.
- Gitea integration controls.

### Mission engine features

- Ordered mission steps.
- Sequential step validation.
- Shared Git command catalog.
- Repository-state validation.
- Mission-specific validation rules.
- Correct-command progression.
- Out-of-sequence command protection.
- Invalid-command handling.
- Live progress percentage updates.
- Support for built-in, published, assigned, existing, unfinished, and retried missions.

### Collaboration features

- Three-person team workflow.
- Feature Developer, Test Developer, and Code Reviewer roles.
- Private Gitea repository provisioning.
- Per-student collaboration workspace.
- Pull Request and review workflow.
- Signed Gitea webhook ingestion.
- Collaboration event persistence.
- Individual and team scoring.
- Bangla feedback and reporting.

---

## Mission-aware terminal model

The terminal is intentionally separated into two responsibilities:

```text
                    GitStack Mission Terminal
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
        Terminal Execution           Mission Validation
                │                           │
                ▼                           ▼
         Real Git / shell            Current mission step
          inside Docker                     │
                                            ▼
                                      Expected action
                                            │
                                            ▼
                                      Progress engine
                                            │
                                            ▼
                                      Live UI update
```

## Technology stack

- **Frontend:** HTML, CSS, vanilla JavaScript, shared responsive dashboard/theme/language layers, xterm.js browser terminal.
- **Backend:** Node.js 20+, Express 5, Zod, JWT/cookie authentication.
- **Database:** PostgreSQL 17 + Prisma 6.
- **Sandbox:** Docker, non-root Debian-based Git container, WebSocket terminal.
- **Collaboration:** Gitea 1.24 + Gitea REST API + signed webhooks.

## System architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                        Browser Clients                        │
│          Student UI                       Instructor UI        │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │ Node.js / Express API│
                    │ + WebSocket Terminal │
                    └───────┬──────┬───────┘
                            │      │
                 ┌──────────┘      └──────────────┐
                 ▼                                ▼
       ┌──────────────────┐              ┌─────────────────┐
       │ PostgreSQL/Prisma│              │ Docker Sandbox  │
       │ users/missions/  │              │ student workdir │
       │ progress/events  │              │ real Git shell  │
       └────────┬─────────┘              └────────┬────────┘
                │                                 │
                │                                 │
                └──────────────┬──────────────────┘
                               ▼
                       Mission Validator
                               │
                               ▼
                        Progress Engine
                               │
                               ▼
                       Assessment / XP

Team collaboration path:

Browser ──> Express ──> Gitea API / Webhooks ──> GitEvent evidence
                                      │
                                      ▼
                              Team assessment
```

See `docs/architecture.md` for the detailed flow.

## Collaboration mission

The final MVP intentionally contains one polished collaboration scenario.

1. Instructor creates/chooses a three-person team.
2. Instructor assigns the published **Collaboration Basics** TEAM mission as ACTIVE.
3. GitStack provisions an organization-owned private Gitea repository, role branches, issue, Gitea team access and signed webhook.
4. Each student starts a separate collaboration sandbox/clone.
5. Feature Developer works on `feature/login-improvement`.
6. Test Developer works independently on `test/login-improvement` and adds automated test evidence.
7. Code Reviewer uses Gitea's real PR/review interface, requests changes and approves corrected work.
8. Feature PR is merged first. Test Developer then brings `main` into the test branch, causing the prepared deterministic conflict in `src/login-policy.txt`.
9. Conflict is resolved to `AUTH_MODE=secure-verified` while preserving `FEATURE_FLAG=enabled` and `TEST_GUARD=enabled`. The deterministic test is run before/after resolution, `tests/test-evidence.md` records both a `FAIL:` explanation and final `PASS:` explanation, then the corrected Test PR is reviewed, approved and merged.
10. Signed webhooks feed GitStack's `GitEvent` table; assessment produces individual/team scores and Bangla feedback.

GitStack does **not** rebuild Gitea's Pull Request/review UI; it links to and assesses the real Gitea workflow.

## Scoring

The collaboration score is transparent and deterministic:

- **70 points — individual role performance**
- **30 points — team workflow**

Feature Developer rules cover the assigned branch, at least two meaningful commits, PR creation and responding after requested changes. Test Developer rules cover the assigned branch, meaningful test work, documented failed/passing evidence and PR creation. Reviewer rules require a substantive review comment, requested changes before approval, final approval and approval after the latest test evidence. Team rules require both team PRs to reference the mission issue, complete event coverage, passing deterministic test evidence, verified conflicting edits from both role branches, preservation of both role-specific changes and feature-before-test merge order.

A run passes only when the required collaboration workflow is complete and its total score is at least 70.

## Clean installation

Run Docker/npm/Prisma commands in the **Ubuntu host terminal**, never in the browser student terminal.

```bash
cd GitStack
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl enable --now docker
npm install
npm run setup -- --rebuild
```

For a first Gitea start, open `http://localhost:3002`, finish the one-time local Gitea setup and create an administrator account. Generate an access token with repository/organization/user permissions required for repository and team management, place it in `.env` as `GITEA_ADMIN_TOKEN`, then restart GitStack.

```bash
npm run gitea:doctor
npm run dev
```

Full instructions are in `RUN_COMMANDS.md` and `docs/deployment-guide.md`.

## Upgrade from an existing GitStack database

**Preserve the exact previous `.env`, especially `DATA_ENCRYPTION_KEY`.** Existing names/emails/IDs are encrypted with that key. Do not generate a new encryption key for an existing database.

Then run:

```bash
npm install
docker compose up -d postgres gitea-db gitea
npm run db:validate
npm run db:generate
npm run db:deploy
npm run db:seed
npm run verify
npm run dev
```

Migration `20260916230000_complete_collaboration_workflow` adds the final collaboration metadata/event fields.

## Main pages

Student:

```text
/student-dashboard.html
/student-missions.html
/student-mission.html
/student-progress.html
/student-assessment.html
/student-team.html
/student-profile.html
/sandbox-terminal.html
```

Instructor:

```text
/instructor-dashboard.html
/instructor-students.html
/instructor-missions.html
/instructor-assignments.html
/instructor-teams.html
/instructor-assessments.html
/instructor-analytics.html
/instructor-activity.html
/instructor-gitea.html
/instructor-collaboration.html
/instructor-profile.html
```

## Verification

Source/UI/MVP checks:

```bash
npm run verify
```

Gitea:

```bash
npm run gitea:doctor
```

Docker sandbox on the Ubuntu host:

```bash
npm run sandbox:doctor
npm run sandbox:test
npm run terminal:test
```

Database:

```bash
npm run db:validate
npm run db:generate
npm run db:deploy
npx prisma migrate status
```

## Final host acceptance

After `.env` contains the real local Gitea token and Docker/Gitea/PostgreSQL are available on Ubuntu, run the complete host acceptance checker:

```bash
npm run acceptance:host
```

It verifies source/UI behavior, Docker and Compose, PostgreSQL readiness, Prisma migrations, mission seeding, the sandbox image/runtime, WebSocket framing, Gitea API permissions and the live GitStack `/api/health` endpoint.

## Security model

GitStack includes several protection layers:

- Argon2 password hashing;
- JWT-based authentication;
- HttpOnly authentication cookies;
- encrypted profile fields;
- role-protected APIs;
- Helmet security headers;
- CORS controls;
- API rate limiting;
- Docker sandbox CPU, memory, PID, timeout, and ownership controls;
- non-root sandbox user;
- no host project mount inside student sandboxes;
- no Docker socket exposed to students;
- isolated networking for individual mission sandboxes;
- private collaboration network for Gitea missions;
- signed Gitea webhook verification using HMAC-SHA256;
- mission command validation before progression.

## Documentation

- `RUN_COMMANDS.md` — sequential run/demo commands
- `docs/architecture.md`
- `docs/database-schema.md`
- `docs/api-documentation.md`
- `docs/mission-design.md`
- `docs/deployment-guide.md`
- `docs/COLLABORATION_COMPLETE.md`
- `docs/PROJECT_PLAN_REFERENCE.txt` — original project-plan reference preserved from the supplied project


## Final MVP status

The codebase implements the documented MVP path: authenticated individual learning, isolated Git practice, real three-person Gitea collaboration, signed activity capture, deterministic conflict/test verification, automatic role/team assessment, Bangla feedback and reporting.

Live Docker/Gitea behavior depends on the host Docker daemon, the local Gitea installation and the permissions of the token configured in `.env`; use the included doctor/setup/verification commands before a faculty demo.