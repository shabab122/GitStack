# Instructor Mission Assignment — Completed

This release completes the instructor-side mission-assignment lifecycle without changing the existing database schema or replacing the surrounding GitStack architecture.

## Supported workflow

- Assign only published missions.
- INDIVIDUAL missions target one active student.
- TEAM missions target one eligible three-person team.
- Team eligibility verifies three active students and the three unique GitStack collaboration roles.
- Assignment lifecycle: DRAFT, ACTIVE, CLOSED, and reopen.
- Optional start and due dates with due-after-start validation.
- Duplicate open assignment protection for the same mission/target.
- Search and status filtering in the instructor UI.
- Assignment summary counters and schedule state (open, scheduled, past due, draft, closed).
- Edit status/start/due dates while keeping mission and target immutable after creation.
- Delete only assignments with no mission-run or collaboration history.
- Team assignment collaboration preparation is resilient: the assignment is retained if Gitea is temporarily unavailable.
- ACTIVE team assignments expose Prepare/Retry so collaboration can be repaired later without recreating the assignment.
- Existing collaboration-preparation, assessment, report, team, student, mission and sandbox structures remain intact.

## Validation

Run:

```bash
npm run assignment:test
npm run verify
npm run db:validate
```

The runtime `.env` file from the supplied project is intentionally preserved unchanged in this modified build.
