# Upgrade from GitStack v12 to v13

> **Historical version note:** This file documents an earlier GitStack milestone. The final v1.0.0 collaboration implementation supersedes its Gitea/future-phase limitations. See `README.md`, `docs/COLLABORATION_COMPLETE.md`, and `RUN_COMMANDS.md` for current behavior.


GitStack v13 keeps the Docker sandbox and browser terminal foundation and adds the student dashboard, mission execution, automatic repository validation, Bangla feedback, XP/progress, encrypted profile fields and student profile management.

## Important: preserve the encryption key

`DATA_ENCRYPTION_KEY` protects encrypted student profile fields. Once v13 encrypts user data, **do not replace or lose this key**. Back it up securely just like `JWT_SECRET`.

## Recommended upgrade on your Ubuntu development machine

1. Keep your old v12 folder as a backup.
2. Extract v13 into a new folder.
3. Copy only your old `.env` into v13 if it contains settings you need. If it has no `DATA_ENCRYPTION_KEY`, `npm run setup` will create one.
4. Keep the existing `gitstack-postgres` Docker volume/container so your accounts and earlier data remain available.
5. Run:

```bash
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl enable --now docker
npm install
npm run setup -- --rebuild
npm run dev
```

The setup process applies the new migration, encrypts/backfills existing user profile fields, seeds the new mission templates, rebuilds/tests the sandbox image and keeps previous database records.

## Student entry points

- Registration: `http://localhost:3000/signup.html?role=student`
- Login: `http://localhost:3000/login.html?role=student`
- Dashboard: `http://localhost:3000/student-dashboard.html`
- Missions: `http://localhost:3000/student-missions.html`
- Independent sandbox playground: `http://localhost:3000/sandbox-terminal.html`

Student registration/login now redirects directly to the student dashboard.

## What is intentionally still a later project milestone

The student Team Activity page is database-ready and displays team assignments when an instructor creates them. Full Gitea-backed team repository creation, Pull Request/review capture and collaboration assessment belong to the later collaboration phase in the project roadmap and are not faked in v13.
