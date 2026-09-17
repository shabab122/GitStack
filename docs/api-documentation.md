# GitStack API — Final MVP

All Student/Instructor APIs require the authenticated HttpOnly session cookie. Public Gitea webhook ingestion does not use a user session; it requires a valid Gitea HMAC signature.

## Student collaboration

- `GET /api/student/team` — team, members, assignments, current run, Gitea repository.
- `GET /api/student/team/candidates` — eligible students for student-created team.
- `POST /api/student/team` — create a valid three-role team.
- `POST /api/student/team/assignments/:id/start` — provision/repair collaboration and start/resume the current student's separate sandbox/clone.
- `POST /api/student/team/assignments/:id/assess` — run collaboration assessment.
- `GET /api/student/team/assignments/:id/report` — current user's team collaboration report.

## Instructor collaboration

- `POST /api/instructor/assignments` — assigning an ACTIVE TEAM mission automatically prepares collaboration.
- `PATCH /api/instructor/assignments/:id` — activating a draft TEAM assignment prepares collaboration.
- `POST /api/instructor/assignments/:id/prepare-collaboration` — idempotent prepare/repair.
- `POST /api/instructor/assignments/:id/assess-collaboration` — run and persist assessment.
- `GET /api/instructor/assignments/:id/collaboration-report` — full team report.

## Instructor Gitea management

`/api/gitea` contains organization/repository/team/branch/Pull Request management used by the Instructor Gitea page. Repository provisioning uses the same underlying Gitea service and access synchronization.

## Webhook

- `POST /api/gitea/webhook`

Headers used:

- `X-Gitea-Signature`
- `X-Gitea-Event`
- `X-Gitea-Delivery`

The raw body is retained by Express only for HMAC verification. Invalid signatures are rejected before event processing.
