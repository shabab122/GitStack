# GitStack complete bugfix report

## Protected data

- The supplied `.env` SHA-256 before and after the work is
  `9e6e76f18d1da2ef344d032eac31653592b9aea2788aeaba0ce6b7e5caec761e`.
- No Prisma schema or migration was edited or executed.
- No database credential, encryption key, Gitea token or webhook secret was changed.
- `.env.example` was changed only to replace secret-looking sample values with explicit placeholders compatible with the existing setup script.

## Confirmed causes and fixes

1. **Duplicate collaboration start** — Team Activity prepared the workspace and
   the terminal immediately called the same start endpoint again. The handoff is
   now one-shot; reloads still validate the workspace.
2. **Repository race / invalid working directory** — concurrent preparation could
   target the live `team-repo`. Starts are serialized, an in-container `flock` is
   used and clones are moved into place atomically.
3. **Missing assigned branch after refresh** — existing private clones fetched
   through a credential-free URL and silently ignored fetch failures. The service
   credential is now temporary, fetch failures are explicit, the role branch is
   verified and the clean remote is restored through an exit trap.
4. **Stale sandbox database row** — a persisted RUNNING row could reference a
   missing/expired container. Start now reconciles Docker state and creates a
   fresh sandbox when required.
5. **False login message / false Connected state** — non-auth failures no longer
   say “Open the Login page”, and Connected is emitted only after shell output.
6. **Generic Docker failure** — common daemon/container/image errors are
   classified, diagnostics are length-limited and URL/token credentials are
   redacted.
7. **Stale cached sandbox image** — the image now has a compatibility schema.
   Setup, acceptance and `project:start` rebuild a missing/outdated image.

## Changed references

| File | Targeted change |
| --- | --- |
| `.env.example` | Safe setup-compatible placeholders; real `.env` untouched |
| `services/collaboration/collaboration-service.js` | start locks, stale/expired-container reconciliation, atomic clone, authenticated fetch cleanup, branch verification, one safe retry |
| `public/student-team.js` | one-shot prepared workspace handoff |
| `public/sandbox-terminal.js` | no duplicate first start, reload repair, stable sandbox ID, correct auth/workspace errors, safe collaboration restart/stop flow |
| `routes/sandbox-routes.js` | blocks unsafe generic collaboration restart |
| `services/sandbox/terminal-manager.js` | real shell readiness and startup timeout |
| `services/sandbox/docker-client.js` | classified, bounded, credential-redacted diagnostics |
| `server.js` | safe Docker exit-code logging |
| `services/sandbox/Dockerfile`, `constants.js`, `image-service.js` | sandbox image compatibility schema |
| `scripts/setup-project.js`, `final-acceptance.js`, `sandbox-doctor.js`, `start-project.js` | rebuild/check outdated images and provide clear status |
| `scripts/test-sandbox-image.js` | pre/post restart diagnostics |
| `scripts/test-student-collaboration-workspace.js` | regression coverage for the fixes above |
| `RUN_COMMANDS.md`, `RELEASE_NOTES.md`, `docs/FINAL_VALIDATION_REPORT.md` | updated safe run/verification guidance |

## Verification completed while packaging

Passed:

```text
npm run verify
npm run db:validate
npm run terminal:test
npm ls --all --depth=0
node --check (77 JavaScript files through npm run check)
```

The packaging environment does not contain the Docker CLI, so it could not run
a live container here. On the Ubuntu host, use the following non-database-mutating
verification sequence:

```bash
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use default
sudo systemctl enable --now docker
npm install
npm run verify
npm run db:validate
npm run sandbox:build
npm run sandbox:doctor
npm run sandbox:test
npm run terminal:test
npm run project:start
```

Do not run `npm run setup` or `npm run acceptance:host` against an existing
database unless migration/seed operations are intentionally approved.
