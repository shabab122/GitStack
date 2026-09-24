# GitStack v1.0.0 — Final MVP

GitStack is a mission-based Git learning and collaboration laboratory for university Software Engineering courses. Students first learn Git in isolated Docker sandboxes and then complete one real three-person Gitea collaboration mission. GitStack records repository/workflow evidence and produces rule-based individual/team scores, Bangla feedback, XP and progress history.

**Learning flow:** Learn Git → Practise Safely → Work in Teams → Follow a Real Workflow → Receive Automatic Assessment.

## Final MVP capabilities

- Student / Instructor signup, login and logout with role-protected APIs.
- Argon2id password hashing, HttpOnly session cookie, encrypted profile fields and stable lookup hashes.
- EN/BN UI, Dark/Light theme and responsive dashboard styling.
- Dynamic instructor mission builder plus protected built-in missions.
- Individual Git missions with repository-state validation instead of command matching.
- Browser terminal backed by non-root Docker sandboxes with CPU, memory, PID, timeout and ownership controls.
- XP, progress, history, leaderboard and top-five milestone badges.
- Instructor/student three-person teams with exactly one Feature Developer, Test Developer and Code Reviewer.
- Real Gitea organization repository provisioning for active team missions.
- Per-team Gitea access synchronization using each student's linked Gitea username.
- Separate collaboration sandbox and repository clone for every student.
- Prepared role branches, mission issue, deterministic conflict file and automated test script.
- Signed Gitea webhook ingestion for issues, branches, pushes, commits, Pull Requests, reviews, requested changes, approvals and merges.
- Persisted `GitEvent` activity timeline and Gitea contribution points.
- Automatic collaboration assessment using **70 role points + 30 team points**.
- Deterministic controlled merge-conflict verification.
- Bangla collaboration feedback, automatic XP award, team/individual reports and instructor collaboration report page.

## Technology stack

- **Frontend:** HTML, CSS, vanilla JavaScript, shared responsive dashboard/theme/language layers, xterm.js browser terminal.
- **Backend:** Node.js 20+, Express 5, Zod, JWT/cookie authentication.
- **Database:** PostgreSQL 17 + Prisma 6.
- **Sandbox:** Docker, non-root Debian-based Git container, WebSocket terminal.
- **Collaboration:** Gitea 1.24 + Gitea REST API + signed webhooks.

## Architecture

```text
Student / Instructor Browser
            |
            v
      Express API + WebSocket
       /        |          \
      v         v           v
PostgreSQL   Sandbox      Gitea API
             Controller      |
                |            |
                v            v
        Separate Docker   Org Repository
          workspaces         |
                \            /
                 \          /
                  v        v
                 Git Events/Webhooks
                        |
                        v
               Assessment Engine
                  /            \
                 v              v
          Individual score   Team score
                 \              /
                  v            v
                 Bangla feedback + XP
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

## Security notes

- `.env` is ignored and must never be committed.
- Never publish `GITEA_ADMIN_TOKEN`, `JWT_SECRET`, `GITEA_WEBHOOK_SECRET` or `DATA_ENCRYPTION_KEY`.
- Student containers have no host-project mount and no Docker socket.
- Individual sandboxes use no network; collaboration sandboxes use only the private GitStack collaboration network.
- Gitea webhooks are verified using HMAC-SHA256 before events are accepted.
- Student-provided terminal commands execute inside the sandbox, not on the application host.

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
