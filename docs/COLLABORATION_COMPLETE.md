# Final Gitea Collaboration Implementation

This build completes the collaboration path required by the supplied GitStack MVP plan at source level.

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

Before a faculty demonstration, run the verification section in `RUN_COMMANDS.md` on the actual Ubuntu/Docker host because live Gitea/webhook/network behavior depends on the local Docker daemon and token permissions.
