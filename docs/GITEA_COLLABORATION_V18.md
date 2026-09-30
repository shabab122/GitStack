# GitStack Gitea Collaboration v18

## Completed

This phase changes repository ownership from individual instructor/student accounts to a dedicated Gitea organization while preserving legacy user-owned repositories already linked in GitStack.

### Ownership
- `GITEA_ORGANIZATION` (default: `gitstack`) owns new GitStack team repositories.
- The configured `GITEA_ADMIN_TOKEN` is the backend service credential; it is not treated as the instructor identity.
- Existing legacy repositories remain readable/manageable by the instructor who owns the corresponding GitStack team and can be moved into the organization from the Instructor Gitea page. The transfer preserves the repository history.

### Instructor workflow
1. Open **Instructor → Gitea**.
2. Click **Set up organization** once if the organization does not exist.
3. Click **Create team repository** and choose a GitStack team.
4. GitStack creates the repository inside the organization.
5. GitStack creates a dedicated Gitea team with write permission and attaches the repository.
   - If a repository was created in the previous user-owned model, use **Move to organization** instead of recreating it; this preserves its Git history.
6. Students add their Gitea username in **Profile**.
7. Instructor clicks **Sync access** to add linked student accounts to the repository team.
8. Instructor can manage branches and Pull Requests from GitStack and can open the repository in Gitea.

### Student workflow
1. Create/use a Gitea account separately in the local Gitea server.
2. Put that exact Gitea username in **Student → Profile → Gitea username**.
3. Open **Student → Team Activity**.
4. GitStack shows the repository, organization owner, clone URL, branch and collaboration instructions.
5. Clone the repository, create a feature branch, commit and push.
6. Open a Pull Request back to `main` for instructor review.

### Permission model
- Platform Admin: full GitStack and Gitea management through the configured service token.
- Instructor: manages repositories for teams they created or teams assigned to their missions.
- Student: receives write access only after their Gitea username is linked and synchronized into the team's Gitea team.
- Other instructors/students do not automatically receive access to another team repository.

### Legacy compatibility
Repositories created by the previous user-owned model are not automatically transferred because repository transfer changes ownership in Gitea. They remain visible to the appropriate GitStack instructor. New repositories use the organization model.

## Database migration
Run:

```bash
npx prisma migrate deploy
npx prisma generate
```

The migration adds:
- `User.giteaUsername`
- `Team.giteaTeamId`
- `Team.giteaTeamName`

## Configuration

```env
GITEA_BASE_URL=http://localhost:3002
GITEA_ADMIN_TOKEN=YOUR_GITEA_TOKEN
GITEA_OWNER=shabab122
GITEA_ORGANIZATION=gitstack
```

The organization is created from the Instructor Gitea page when it is missing. Gitea's organization repository and team APIs support organization-owned repositories and team-level permissions.
