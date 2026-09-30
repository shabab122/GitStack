# GitStack Final MVP Architecture

## Product layers

1. Mission/learning system
2. Safe Docker practice environment
3. Real Gitea team collaboration
4. Deterministic workflow assessment

## Request/data flow

```text
Browser -> Express REST API -> Prisma -> PostgreSQL
Browser -> WebSocket terminal -> Sandbox controller -> Docker student container
Express -> Gitea REST API -> Gitea organization/repositories/teams
Gitea -> signed webhook -> /api/gitea/webhook -> GitEvent -> assessment engine
```

### Individual mission

A MissionTemplate creates a MissionRun. The student receives an isolated non-root sandbox. Submission validators inspect repository state (files, tracked state, history, branches and cleanliness) instead of matching a specific command. AssessmentResult and Bangla Feedback are persisted; XP is awarded once.

### Collaboration mission

An ACTIVE TEAM Assignment triggers `prepareCollaborationAssignment()`:

```text
Team Assignment
  -> provision organization repository
  -> seed collaboration mission files
  -> create/sync Gitea team access
  -> create signed webhook
  -> create mission issue
  -> create role branches
  -> create one MissionRun per member
```

Each member starts `startCollaborationWorkspace()`, receiving a distinct COLLABORATION-mode Docker sandbox and clone. The sandbox can reach Gitea only through `gitstack-sandbox-network`; it has no Docker socket or host-project mount.

### Event-driven assessment

Gitea webhooks are HMAC-SHA256 verified. Supported evidence is normalized into GitEvent records: ISSUE, BRANCH, COMMIT, PUSH, PULL_REQUEST, REVIEW, CHANGES_REQUESTED, APPROVAL, TEST, MERGE and CONFLICT_RESOLUTION.

Assessment combines 70 individual-role points with 30 team-workflow points and verifies repository state for passing test evidence and deterministic conflict resolution.
