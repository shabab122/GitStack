# Upgrade GitStack v13 → v14

The v14 ZIP contains the entire project. Keep your existing `.env` and PostgreSQL volume when upgrading so encrypted user data remains readable.

## Recommended local upgrade

1. Back up the old v13 folder and `.env`.
2. Extract the v14 ZIP.
3. Copy the old `.env` into v14 **without changing `DATA_ENCRYPTION_KEY`**.
4. Run:

```bash
cd GitStack-v14-Instructor-Dashboard-Complete
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl enable --now docker
npm install
docker start gitstack-postgres 2>/dev/null || docker compose up -d postgres
npm run db:generate
npm run db:deploy
npx prisma migrate status
npm run db:encrypt-users
npm run db:seed
npm run check
npm run student:test
npm run instructor:test
npm run dev
```

The new migration adds only nullable instructor-dashboard relationship fields, so existing users, mission runs, sandbox history, assessments and XP are preserved.

## Acceptance check

- Student login still opens Student Dashboard.
- Instructor registration/login opens Instructor Dashboard.
- Instructor can see registered students.
- Instructor can create a three-person team.
- Instructor can assign Git Basics to a student.
- Student Dashboard shows the assignment.
- Student can complete the mission and earn XP exactly as in v13.
