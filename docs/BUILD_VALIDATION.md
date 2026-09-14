# GitStack v14 Build Validation

GitStack v14 was checked before packaging with the following source-level and integration-structure validations:

- JavaScript syntax validation across 61 project files
- Student dashboard structure, encryption helper, and mission workflow checks
- Instructor dashboard structure, role protection, assignment, and three-person-team checks
- WebSocket framing test for the browser terminal
- Prisma schema validation
- Prisma Client generation using Prisma 6.19.0
- Instructor router module import test
- Student router module import test
- Static HTTP serving checks for instructor pages, student pages, signup, and sandbox pages
- Local HTML href/src reference validation (no missing local references)
- V13 preservation check: every packaged V13 source file is still present in V14
- Migration structure check for instructor team ownership and direct student assignments

## Validation commands that passed in the artifact build environment

```bash
npm run check
npm run student:test
npm run instructor:test
npm run terminal:test
DATABASE_URL='postgresql://gitstack:gitstack@localhost:5432/gitstack?schema=public' npx prisma validate
DATABASE_URL='postgresql://gitstack:gitstack@localhost:5432/gitstack?schema=public' npx prisma generate
```

## Live environment validation still required

The artifact-building environment does not expose the user's Docker daemon or PostgreSQL service. Therefore the final live acceptance test must run on the Ubuntu development machine:

```bash
npm install
npm run setup -- --rebuild
npm run dev
```

Then verify these flows:

1. Instructor signup redirects to `instructor-dashboard.html`.
2. Instructor login redirects to `instructor-dashboard.html`.
3. Instructor creates a three-person team with the three distinct roles.
4. Instructor assigns a published mission to a student.
5. The student sees that assignment in the existing student dashboard.
6. The student completes the mission in the existing Docker browser terminal.
7. The instructor sees the result under Students, Assessments, Analytics, and Activity.
8. Existing student dashboard, Docker sandbox, reset/start/stop/delete, XP, and progress behavior remains working.

Gitea repository, Pull Request, review, webhook, and collaboration-event functionality is intentionally not fabricated in V14. Those are the next integration milestone.
