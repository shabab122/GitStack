# GitStack v1.0.0 — Sequential Run, Upgrade and Demo Commands

Use the **Ubuntu host terminal** for Docker, npm and Prisma commands. The browser terminal is only for student Git/Linux work.

## A. First-time clean setup

```bash
cd /path/to/GitStack
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl enable --now docker
docker ps
npm install
npm run setup -- --rebuild
```

`npm run setup` creates a safe `.env` for a fresh installation, builds/tests the sandbox image, starts PostgreSQL/Gitea, deploys Prisma migrations and seeds the missions.

### First Gitea setup

Open:

```text
http://localhost:3002
```

The compose file already provides Gitea's dedicated PostgreSQL connection. Complete the one-time Gitea installation and create the administrator account.

Then open:

```text
http://localhost:3002/user/settings/applications
```

Generate a token for GitStack with `write:admin`, `write:organization`,
`write:repository`, `write:issue` and `read:user`. Do not paste the token into
source code or give it to students.

```bash
nano .env
```

Set:

```env
GITEA_ADMIN_TOKEN=<your-new-token>
GITEA_OWNER=<your-gitea-admin-username>
GITEA_ORGANIZATION=gitstack
```

Keep these defaults unless your ports differ:

```env
GITEA_BASE_URL=http://localhost:3002
GITEA_INTERNAL_BASE_URL=http://gitstack-gitea:3000
GITEA_WEBHOOK_TARGET_URL=http://host.docker.internal:3000/api/gitea/webhook
SANDBOX_COLLABORATION_NETWORK=gitstack-sandbox-network
```

When an existing Gitea container uses a different Docker name, optionally set
`GITEA_DOCKER_CONTAINER=<existing-container-name>`. GitStack only attaches that
container to the private collaboration network; it does not recreate the
container or change its database volume.

Verify:

```bash
npm run gitea:doctor
```

Start:

```bash
npm run dev
```

## B. Upgrade from an existing working GitStack version

Copy the previous working `.env` into this project **before running setup or migrations**. Preserve `DATA_ENCRYPTION_KEY` exactly.

```bash
cd /path/to/GitStack
cp /path/to/previous/GitStack/.env .env
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl enable --now docker
npm install
docker compose up -d postgres gitea-db gitea
npm run db:validate
npm run db:generate
npm run db:deploy
npx prisma migrate status
npm run db:seed
npm run verify
npm run gitea:doctor
npm run dev
```

If your old Gitea instance used another data layout, export/backup it before replacing volumes. The final compose uses a dedicated Gitea PostgreSQL database to prevent Gitea tables from contaminating the GitStack application database.

## C. Daily startup

```bash
cd /path/to/GitStack
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl start docker
docker compose up -d postgres gitea-db gitea
npm run dev
```

Open:

```text
GitStack:              http://localhost:3000
Student dashboard:     http://localhost:3000/student-dashboard.html
Instructor dashboard:  http://localhost:3000/instructor-dashboard.html
Instructor Gitea:      http://localhost:3000/instructor-gitea.html
Collaboration reports: http://localhost:3000/instructor-collaboration.html
Gitea:                 http://localhost:3002
Sandbox terminal:      http://localhost:3000/sandbox-terminal.html
```

## D. Full verification before demonstration

```bash
npm run verify
npm run student:collaboration:test
npm run db:validate
npm run db:generate
npm run db:deploy
npx prisma migrate status
npm run gitea:doctor
npm run sandbox:doctor
npm run sandbox:test
npm run terminal:test
```

## E. Final collaboration demo sequence

1. Create/register three Student accounts and one Instructor account.
2. Each student creates/links a Gitea account and saves the Gitea username in **Student → Profile**.
3. Instructor creates a three-person team with unique roles:
   - Feature Developer
   - Test Developer
   - Code Reviewer
4. Instructor assigns the published **Collaboration Basics** TEAM mission as ACTIVE.
5. GitStack automatically provisions/repairs:
   - `gitstack` Gitea organization
   - private team repository
   - Gitea team/write access
   - generated mission issue
   - role branches
   - deterministic conflict/test files
   - signed repository webhook
   - three MissionRun records
6. Each student opens **Team Activity** and clicks **Start/Continue workspace**. Each receives a separate Docker container/clone and starts on the role branch.
7. Feature Developer:
   - edits the prepared feature work
   - creates at least two meaningful commits
   - pushes `feature/login-improvement`
   - opens a real Gitea PR referencing the generated issue
8. Code Reviewer reviews the PR and **requests changes**.
9. Feature Developer makes and pushes the requested update.
10. Reviewer approves and merges the Feature PR.
11. Test Developer:
    - changes the prepared policy on `test/login-improvement`
    - runs `sh tests/verify-login-policy.sh` before resolution and records a meaningful `FAIL:` line in `tests/test-evidence.md`
    - pushes `test/login-improvement`
    - opens a PR referencing the issue
    - updates from `main`, intentionally hitting the prepared conflict
    - resolves `src/login-policy.txt` to `AUTH_MODE=secure-verified`
    - runs `sh tests/verify-login-policy.sh`
    - appends a meaningful `PASS:` line to `tests/test-evidence.md`
    - pushes the resolution/test evidence
12. Reviewer verifies evidence, approves and merges.
13. Open Student Team Activity → **Check workflow / View report**.
14. Open Instructor → **Collaboration** and confirm:
    - issue/branch/commit/push/PR/review/requested-changes/test/approval/merge events
    - role score out of 70
    - team score out of 30
    - total score
    - Bangla feedback
    - completed assignment/XP when all requirements pass

## F. Useful database checks

```bash
docker exec -it gitstack-postgres psql -U gitstack -d gitstack -c '\dt'
```

Teams and repositories:

```bash
docker exec -it gitstack-postgres psql -U gitstack -d gitstack -c 'SELECT name,"giteaOwner","giteaRepository","giteaRepositoryUrl","giteaWebhookId" FROM "Team" ORDER BY "createdAt" DESC;'
```

Collaboration events:

```bash
docker exec -it gitstack-postgres psql -U gitstack -d gitstack -c 'SELECT "eventType",action,branch,"scoreValue","occurredAt" FROM "GitEvent" ORDER BY "occurredAt" DESC LIMIT 100;'
```

Assessment results:

```bash
docker exec -it gitstack-postgres psql -U gitstack -d gitstack -c 'SELECT "individualScore","teamScore","totalScore",passed,"assessedAt" FROM "AssessmentResult" ORDER BY "assessedAt" DESC;'
```

## G. Common problems

### Docker still points to Podman

```bash
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl restart docker
docker ps
```

Remove a persistent `DOCKER_HOST=...podman.sock` export from your shell startup file if it keeps returning.

### `DATABASE_URL` missing

`.env` must be in the project root beside `package.json`.

### Existing encrypted profile fields cannot be read

Restore the original `DATA_ENCRYPTION_KEY`. Never generate a new key for an existing GitStack database.

### Gitea returns 401

The token is invalid/old. Generate a new token, update `.env`, restart Node and run `npm run gitea:doctor`.

### Gitea returns 403 / scope error

Regenerate the token with repository, organization and user permissions required for repository/team/webhook management.

### Collaboration repository is not prepared

```bash
npm run gitea:doctor
```

Then Instructor → Assignments/Collaboration → **Prepare/repair workspace**.

### Docker network already exists from an old version

Stop old GitStack containers first. If an unused manually-created network blocks Compose, inspect it before removal:

```bash
docker network inspect gitstack-sandbox-network
```

Only if it is unused by important containers:

```bash
docker network rm gitstack-sandbox-network
docker compose up -d postgres gitea-db gitea
```

### Never delete volumes casually

Do not run `docker compose down -v` unless you intentionally want to erase GitStack and Gitea data.

## H. Stop

Stop Node with `Ctrl+C`, then optionally:

```bash
docker compose stop
```


## Final one-command host acceptance

After setup and after adding a real `GITEA_ADMIN_TOKEN` to `.env`:

```bash
npm run acceptance:host
```

A successful run ends with `GitStack FINAL HOST ACCEPTANCE: PASSED`.
