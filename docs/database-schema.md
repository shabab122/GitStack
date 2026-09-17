# GitStack Database Schema

Core Prisma entities:

- **User** — encrypted profile/account fields, role, XP, optional `giteaUsername`.
- **Team** — three-person collaboration team plus Gitea repository/team/webhook linkage.
- **TeamMember** — user/team relationship and Feature Developer/Test Developer/Code Reviewer role.
- **MissionTemplate** — dynamic/built-in mission definition, type, instructions and validation rules.
- **Assignment** — instructor mission assignment; team assignments store collaboration preparation, generated Gitea issue and state.
- **MissionRun** — one student's attempt/workflow, repository link, role snapshot, progress and XP.
- **SandboxSession** — Docker sandbox lifecycle, owner, mode, expiry and container metadata.
- **GitEvent** — signed Gitea event evidence associated with MissionRun and optional actor.
- **AssessmentResult** — individual/team/total score, rule results and pass state.
- **Feedback** — persisted English/Bangla feedback.

Collaboration relationships:

```text
Team 1---* TeamMember *---1 User
Team 1---* Assignment *---1 MissionTemplate
Assignment 1---* MissionRun *---1 User
MissionRun 1---* GitEvent
MissionRun 1---1 AssessmentResult
MissionRun 1---* Feedback
MissionRun 1---* SandboxSession
```

`GitEvent.giteaEventId` is unique to make webhook processing idempotent. The final collaboration migration is `20260916230000_complete_collaboration_workflow`.
