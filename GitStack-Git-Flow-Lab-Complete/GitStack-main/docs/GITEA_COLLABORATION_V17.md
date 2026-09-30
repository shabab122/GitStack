# GitStack Gitea Collaboration — v17

This phase connects the existing Gitea service foundation to the Instructor workspace without changing the existing student/sandbox workflows.

## Included

- Instructor-only `/api/gitea` API protected by the existing authentication middleware.
- Gitea connection/status check.
- Repository list and detail lookup.
- Repository creation with optional GitStack team linkage.
- Safe repository deletion: GitStack blocks deletion when a linked team already has assignment or mission history.
- Branch listing and branch creation.
- Open Pull Request listing and Pull Request creation.
- Team records now store the linked Gitea owner, repository, repository ID, URL and provisioning time.
- New Instructor **Gitea** page and navigation entry.
- Team management now shows the linked repository and links directly to Gitea management.

## Configuration

Set these values in `.env`:

```text
GITEA_BASE_URL=http://localhost:3002
GITEA_ADMIN_TOKEN=<secret token>
GITEA_OWNER=<optional Gitea username>
```

`GITEA_OWNER` is optional. When present, repository creation uses Gitea's admin create-repository-for-user API. When absent, the API token owner is used.

## Migration

Run:

```bash
npx prisma migrate deploy
npx prisma generate
```

For local development where migrations are normally applied with Prisma Migrate, `npx prisma migrate dev` is also acceptable.
