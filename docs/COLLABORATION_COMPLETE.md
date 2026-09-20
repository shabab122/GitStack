# Instructor Collaboration Workflow

This build completes the instructor collaboration report and the supporting
Gitea workflow without changing the existing database schema or stored users.

Implemented path:

```text
Instructor assigns active TEAM mission
 -> organization repository + Gitea team + webhook
 -> mission issue + three role branches
 -> separate sandbox/clone per student
 -> push/commit/PR/review/request-changes/test/approval/merge events
 -> deterministic merge conflict verification
 -> persisted GitEvent timeline
 -> 70-point role score + 30-point team score
 -> Bangla feedback + XP + reports
```

The system intentionally uses Gitea's native Issue/Pull Request/Review UI rather than rebuilding those interfaces inside GitStack.

The instructor report now includes:

- Gitea connection and assignment readiness status
- safe, repeatable workspace preparation
- the full 11-step Issue-to-Merge workflow with evidence counts
- individual role scores, team checks, total scores, status, and feedback
- a filterable Gitea event timeline linked to the relevant repository resource
- explicit loading, empty, warning, and failure states

The student Team Activity workspace now uses the same evidence source as the
instructor report. It includes:

- the student's exact role, assigned branch and generated mission issue
- role-specific Feature Developer, Test Developer or Code Reviewer steps
- safe starter commands that never contain the instructor service token
- live 11-stage workflow progress, event totals, score and next-action guidance
- Start/Continue workspace, Refresh progress, Check workflow and View report actions
- an assignment-aware Docker terminal that opens the prepared clone, restores it
  after reset and keeps repository/issue links visible
- a linked-account guard so a student cannot begin with missing Gitea access

The default Gitea container is attached to the private collaboration network
idempotently when a student starts a workspace. This changes only Docker network
membership; it does not recreate the container, alter its volume or modify
database/user credentials.

Workspace preparation verifies the three required roles, provisions the
repository/team/webhook/issue/branches, and reconciles missing provisioning
events. Gitea teams are created with explicit code, issue, and Pull Request
unit permissions so current Gitea releases accept the request. Assessment is
repeatable: webhook-triggered checks do not increment
manual submission counts, and XP can only be awarded once per mission run.

Before a faculty demonstration, run the verification section in `RUN_COMMANDS.md` on the actual Ubuntu/Docker host because live Gitea/webhook/network behavior depends on the local Docker daemon and token permissions.
