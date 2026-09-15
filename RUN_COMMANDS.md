# GitStack v15 — Run and Verification Commands

## 1. Upgrade safely from the previous working version

Extract the project, then copy the **same previous `.env`** into the new v15 root before running database/setup commands.

```bash
cd ~/Desktop/GitStack/GitStack-v15
```

If your previous version is beside it:

```bash
cp ../GitStack-v14/.env .env
```

Use the actual previous folder name if different. Never replace the previous `DATA_ENCRYPTION_KEY` when reusing the existing database.

## 2. Prepare Docker

```bash
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl enable --now docker
docker ps
```

## 3. Install dependencies

```bash
npm install
```

## 4. Start/verify PostgreSQL

```bash
docker start gitstack-postgres 2>/dev/null || docker compose up -d postgres
docker exec gitstack-postgres pg_isready -U gitstack -d gitstack
```

## 5. Validate and deploy Prisma

```bash
npm run db:validate
npm run db:generate
npm run db:deploy
npx prisma migrate status
npm run db:seed
```

Expected migration history includes the earlier migrations plus:

```text
20260909224500_dynamic_missions
```

## 6. Verify source and features

```bash
npm run check
npm run ui:test
npm run feature:test
npm run student:test
npm run instructor:test
npm run terminal:test
```

## 7. Verify Docker sandbox

Run these in the **Ubuntu host terminal**, not in the browser student terminal:

```bash
npm run sandbox:doctor
npm run sandbox:test
```

## 8. Full verification

```bash
npm run verify
```

## 9. Start GitStack

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

## 10. Daily startup

```bash
cd ~/Desktop/GitStack/GitStack-v15
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl start docker
docker start gitstack-postgres 2>/dev/null || docker compose up -d postgres
npm run dev
```

## 11. Test the new v15 features

### Student leaderboard

1. Login as Student.
2. Open Student Dashboard.
3. Confirm XP ranking loads from real student data.
4. Confirm ranks #1–#5 use Diamond, Platinum, Gold, Silver, Bronze badges.
5. Switch Dark/Light and EN/BN and verify the page remains readable.

### Dynamic missions

1. Login as Instructor.
2. Open **Missions**.
3. Create an Individual custom mission with at least one automatic validation rule.
4. Publish it.
5. Assign it to a Student.
6. Login as that Student, start the mission, complete the repository task, and submit.
7. Confirm assessment and XP are stored.
8. Edit/unpublish the custom mission from the Instructor side.

### Instructor leaderboards

1. Open Instructor Dashboard.
2. Confirm **Top Rated** ranks by XP.
3. Confirm **Top Contributors** uses real mission/assessment activity.
4. Open team creation and verify ranking/contribution information can help compare students.

### Student-created team

1. Login as a Student who is not already in a team.
2. Open **Team Activity**.
3. Select two available students plus yourself.
4. Assign Feature Developer, Test Developer, and Code Reviewer exactly once each.
5. Create the team.
6. Login as Instructor and confirm the team appears as Student-formed.

## 12. Inspect database

Tables:

```bash
docker exec -it gitstack-postgres psql -U gitstack -d gitstack -c '\dt'
```

Custom missions:

```bash
docker exec -it gitstack-postgres psql -U gitstack -d gitstack -c 'SELECT "id", slug, title, "createdById", "isPublished", "xpReward" FROM "MissionTemplate" ORDER BY "createdAt" DESC LIMIT 20;'
```

Top XP students (profile fields are encrypted in PostgreSQL by design):

```bash
docker exec -it gitstack-postgres psql -U gitstack -d gitstack -c 'SELECT "id", xp, role, "createdAt" FROM "User" WHERE role = '\''STUDENT'\'' ORDER BY xp DESC LIMIT 10;'
```

Teams:

```bash
docker exec -it gitstack-postgres psql -U gitstack -d gitstack -c 'SELECT "id", name, "createdById", "createdAt" FROM "Team" ORDER BY "createdAt" DESC LIMIT 20;'
```

## 13. Prisma Studio

```bash
npm run db:studio
```

Open `http://localhost:5555`.

## 14. Common errors

### `Environment variable not found: DATABASE_URL`

`.env` must be in the **project root**, beside `package.json`, not inside `services/` or another folder.

### Old encrypted names become blank/unreadable

Restore the previous working `DATA_ENCRYPTION_KEY`. Do not generate a new one for an existing database.

### Docker points to Podman

```bash
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl restart docker
docker ps
```

### Schema is behind

```bash
npm run db:validate
npm run db:generate
npm run db:deploy
npx prisma migrate status
```

## 15. Stop safely

Stop Node with `Ctrl+C`, then optionally:

```bash
docker stop gitstack-postgres
```

Do **not** run `docker compose down -v` unless you intentionally want to delete the PostgreSQL volume/data.

## Gitea organization collaboration (v18)

After updating to the organization-based Gitea collaboration phase:

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run dev
```

Configure `.env`:

```env
GITEA_BASE_URL=http://localhost:3002
GITEA_ADMIN_TOKEN=YOUR_GITEA_TOKEN
GITEA_OWNER=YOUR_GITEA_USERNAME
GITEA_ORGANIZATION=gitstack
```

Then open **Instructor → Gitea → Set up organization** once. New team repositories are created under the `gitstack` organization. Students link their Gitea username in **Student → Profile**, and instructors use **Sync access** on the team repository.
