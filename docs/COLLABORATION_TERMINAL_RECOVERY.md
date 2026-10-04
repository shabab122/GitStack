# Collaboration sandbox Git connection fix

The reported server error was `Repository clone failed: The Gitea repository
operation timed out`. The terminal then exited because
`/workspace/team-repo` had not been created. A successful Gitea API check on the
app host does not prove that the sandbox can reach Gitea across Docker bridges.

## This fix

Collaboration Git HTTP now travels through the app server over Docker exec.
A small listener binds only to `127.0.0.1` inside the student sandbox. The app
forwards its Git requests to the existing `GITEA_BASE_URL`; Docker bridge DNS,
stale private IP addresses and bridge firewall routing are no longer required
for clone, fetch, pull or push. No host listening port, firewall change, new
container image, npm dependency or database migration is added. The Debian
sandbox already contains Perl through its existing Git package dependency;
the listener uses only Perl core modules.

The relay only forwards to the configured Gitea Git service. Gitea still
checks every request's credentials and repository permissions. The relay does
not supply an instructor token to student commands. Server clone/fetch uses
the existing service account transiently; student push still prompts for that
student's Gitea username and personal token. No tokens or HTTP authorization
headers are stored in the student's repository configuration or relay logs.
The repository keeps its existing credential-free origin; only a local HTTP
proxy setting is added. Collaboration shell commands clear NO_PROXY so an
inherited host setting cannot silently bypass this connection.

An app restart recreates the relay and refreshes a healthy clone's proxy when
the student reconnects. It does not reset the branch or delete unpushed work.
Docker restart recovery restores the assigned branch and commits already
pushed to Gitea. As before, stopped/deleted sandbox tmpfs loses unpushed files.
Existing repository setup, ownership checks, branch checks, retry controls,
signed webhook processing and instructor collaboration assessment remain.
Individual mission terminals do not use this relay.

## Run the updated project

Stop the older Node app before starting this copy. Use the existing `.env`
and existing Docker data volumes; do not reset/delete the database or Gitea.
From the updated `GitStack-main` directory:

```bash
npm ci
npm run verify
npm run project:start
```

Hard-refresh the browser (Ctrl+Shift+R). Open Team Activity, select Continue
workspace and use Reconnect terminal if a previous failed page is still open.
No environment credential changes, migrations, reseeding or sandbox image
rebuild are needed for this update.

## Validation

`npm run collaboration:transport:test` deliberately creates a direct Git
endpoint that accepts connections but never answers. It confirms that relay
clone and all three members' own authenticated pushes succeed without reaching
that stalled endpoint. It also covers a streaming 2 MB pack, credential
cleanup, app restart reattachment, tmpfs restore and preservation of unpushed
files. The test opens the production authenticated WebSocket gateway and real
PTY shell, runs Git status, answers username/token prompts and verifies the
pushed commit on an authenticated Git smart-HTTP server. The existing tests
cover role branches, fetch, merges/conflict resolution, PR/review workflow
rules, signed webhook attribution, terminal recovery and mission isolation.

These are disposable Git repositories and Docker/Prisma adapters. The test
environment has no Docker daemon or accessible live Gitea installation. It
does not access or mutate the user's database or Gitea deployment. A native
Gitea download was also blocked by the validation environment's network.
