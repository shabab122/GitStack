# GitStack v14 — Run and Verification Commands

## Daily startup

```bash
cd ~/Downloads/GitStack-v14-Instructor-Dashboard-Complete
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl start docker
npm run project:start
```

Open:

```text
http://localhost:3000
http://localhost:3000/student-dashboard.html
http://localhost:3000/instructor-dashboard.html
http://localhost:3000/sandbox-terminal.html
```

## First-time setup / clean rebuild

```bash
cd ~/Downloads/GitStack-v14-Instructor-Dashboard-Complete
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl enable --now docker
npm install
npm run setup -- --rebuild
npm run dev
```

## Verify Docker

```bash
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl is-active docker
docker ps
npm run sandbox:doctor
npm run sandbox:test
```

## Verify PostgreSQL and Prisma

```bash
docker start gitstack-postgres 2>/dev/null || docker compose up -d postgres
docker exec gitstack-postgres pg_isready -U gitstack -d gitstack
npm run db:generate
npm run db:deploy
npx prisma migrate status
npm run db:seed
```

Expected migration list includes:

```text
20260723180226_init
20260806195000_complete_sandbox_subsystem
20260807143000_student_dashboard_and_encryption
20260807190000_instructor_dashboard
```

## Verify source and dashboards

```bash
npm run check
npm run student:test
npm run instructor:test
npm run terminal:test
```

Broader verification:

```bash
npm run verify
```

## Check API health

Run the server first with `npm run dev`, then in another terminal:

```bash
curl -sS http://localhost:3000/api/health | python3 -m json.tool
```

Expected database status: `connected`.

## Test Student flow

1. Open `http://localhost:3000/signup.html?role=student`.
2. Register; it should redirect to `student-dashboard.html`.
3. Start Git Basics.
4. Confirm browser terminal shows `Connected`.
5. Run:

```bash
whoami
pwd
git --version
git init
touch profile.html
git add profile.html
git commit -m "Add profile page"
git status
```

6. Submit the mission; XP should be stored and displayed.

## Test Instructor flow

1. Open `http://localhost:3000/signup.html?role=instructor`.
2. Register with a designation such as `Lecturer`.
3. It should redirect to `instructor-dashboard.html`.
4. Open **Students** and confirm student records load.
5. Open **Teams** and create a team with exactly three different students and three unique roles.
6. Open **Assignments** and assign Git Basics to a student.
7. Log in as that student and confirm the assignment appears on the Student Dashboard.
8. Complete the mission, then log back in as the instructor and confirm **Assessments**, **Analytics** and **Activity** reflect the result.

## Inspect database tables

```bash
docker exec -it gitstack-postgres psql -U gitstack -d gitstack -c '\dt'
```

Recent users:

```bash
docker exec -it gitstack-postgres psql -U gitstack -d gitstack -c 'SELECT "id", role, xp, "createdAt" FROM "User" ORDER BY "createdAt" DESC LIMIT 10;'
```

Recent assignments:

```bash
docker exec -it gitstack-postgres psql -U gitstack -d gitstack -c 'SELECT "id", "missionTemplateId", "studentId", "teamId", status, "dueAt" FROM "Assignment" ORDER BY "createdAt" DESC LIMIT 10;'
```

Recent teams:

```bash
docker exec -it gitstack-postgres psql -U gitstack -d gitstack -c 'SELECT "id", name, "createdById", "createdAt" FROM "Team" ORDER BY "createdAt" DESC LIMIT 10;'
```

## Prisma Studio

```bash
npm run db:studio
```

Open `http://localhost:5555`.

## Rebuild sandbox only after Dockerfile changes

```bash
docker ps -a --filter "label=gitstack.managed=true" --format "{{.ID}}" | xargs -r docker rm -f
docker image rm -f gitstack-sandbox:week1 2>/dev/null || true
npm run sandbox:build
npm run sandbox:test
```

## Docker daemon unavailable

```bash
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl restart docker
docker ps
npm run sandbox:doctor
```

## Database schema mismatch

```bash
docker start gitstack-postgres 2>/dev/null || docker compose up -d postgres
npm run db:generate
npm run db:deploy
npx prisma migrate status
```

## Stop project safely

Stop Node with `Ctrl+C`, then:

```bash
docker stop gitstack-postgres
```

Do not run `docker compose down -v` unless you intentionally want to delete the PostgreSQL data volume.
