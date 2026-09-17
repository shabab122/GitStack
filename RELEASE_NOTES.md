# GitStack v1.0.0 — Release Notes

This final MVP completes the documented flow:

**Learn Git → Practise Safely → Work in Teams → Follow a Real Gitea Workflow → Receive Automatic Assessment**

## Final collaboration implementation

- Three-person team roles: Feature Developer, Test Developer, Code Reviewer.
- Organization-owned private Gitea repositories.
- Gitea team/member access synchronization using linked usernames.
- Role branches and separate student collaboration sandboxes.
- Real Gitea issue/PR/review workflow.
- HMAC-SHA256 signed webhook ingestion.
- GitEvent tracking for issue, branch, commit, push, PR, review, requested changes, approval, test, merge and conflict resolution evidence.
- Deterministic merge-conflict mission with state-based verification.
- 70-point individual role score + 30-point team workflow score.
- Bangla feedback, XP awards, reports and activity/leaderboard integration.

## Final verification commands

```bash
npm run verify
npm run db:validate
npm run db:generate
npm run collaboration:test
npm run acceptance:host
```

See `README.md`, `RUN_COMMANDS.md`, and `docs/FINAL_VALIDATION_REPORT.md` for setup and demonstration instructions.
