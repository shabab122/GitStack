# GitStack v1.0.0 — Release Notes

## Complete sandbox/workspace stability bugfix

- Team Activity now marks its completed sandbox handoff, so the terminal does not immediately execute the same assignment start a second time. A later page reload still revalidates and repairs the temporary repository.
- Collaboration starts are serialized in Node and locked inside the container. New clones are prepared in a temporary directory and moved into place atomically, preventing a live shell from being left inside a removed or half-created `/workspace/team-repo`.
- Existing clones temporarily authenticate only for server-side fetch, always restore the credential-free remote, verify the exact assigned branch and report actionable clone/fetch/branch errors.
- Missing or expired Docker containers are reconciled with persisted sandbox rows before handoff; one safe retry absorbs a transient idempotent workspace-preparation failure.
- Collaboration sandboxes can no longer be restarted through the generic endpoint that omits repository restoration. Stop/restart messaging now accurately explains tmpfs data loss.
- The browser distinguishes authentication failures from Docker/workspace failures and no longer tells an already logged-in student to log in again.
- A terminal is marked Connected only after the shell emits output; startup timeout/early exit now produce explicit errors.
- Docker diagnostics are bounded and credential-redacted. Cached sandbox images carry a schema label and are rebuilt automatically by setup/project start when outdated.
- `.env` was preserved byte-for-byte. No database schema, migration, credential or important token was changed.

## Bidirectional collaboration bridge

- Team Activity, the collaboration terminal and instructor Collaboration Reports now read one versioned workflow state.
- Student Gitea evidence reaches the instructor automatically; preparation, review feedback and assessment results return to students automatically.
- Both dashboards refresh live every 15 seconds while retaining manual refresh actions.
- Role-specific next actions are calculated once on the server and displayed consistently on both sides.
- No Prisma schema, migration, database credential or token change is required.

## Sandbox terminal stability fix

- Opening, focusing or resizing the terminal no longer executes visible `stty`, `cd` or `git status` commands.
- Page refreshes reuse the active WebSocket session instead of repeatedly reconnecting it.
- A collaboration terminal load safely verifies and repairs the prepared repository clone before connecting.
- Terminal commands now run only after the student enters them, apart from the isolated server-side workspace preparation step.

This final MVP completes the documented flow:

**Learn Git → Practise Safely → Work in Teams → Follow a Real Gitea Workflow → Receive Automatic Assessment**

## Final collaboration implementation

- Three-person team roles: Feature Developer, Test Developer, Code Reviewer.
- Organization-owned private Gitea repositories.
- Gitea team/member access synchronization using linked usernames.
- Explicit code, issue and Pull Request team-unit permissions for current Gitea releases.
- Role branches and separate student collaboration sandboxes.
- Complete Student Team Activity workspace with role-specific instructions, live 11-stage evidence, next-action guidance and assignment-aware terminal handoff.
- Safe collaboration-sandbox network repair that attaches the existing Gitea container without recreating it or changing stored data.
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
npm run student:collaboration:test
npm run bridge:test
npm run acceptance:host
```

See `README.md`, `RUN_COMMANDS.md`, and `docs/FINAL_VALIDATION_REPORT.md` for setup and demonstration instructions.
