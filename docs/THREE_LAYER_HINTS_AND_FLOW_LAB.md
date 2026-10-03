# Three-layer mission hints and Git Flow Lab

## Upgrade an existing installation

Keep your current `.env` and Docker volumes. In the updated project folder:

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run verify
npm run dev
```

The application database must be running for migration deployment. Migration
`20261003070000_three_layer_mission_hints` adds one column and a range constraint
to `MissionHintUse`. Previously purchased answers are level 3 and keep their
original paid cost. No users, mission runs, XP balances, database credentials,
Gitea configuration, volumes, or ports are rewritten. Existing installations
continue using application port 3000 and Gitea port 3002. Do not seed or delete
volumes during a routine upgrade.

## Student hints

Each current, unfinished step has three controls:

| Layer | Help | Example share of a 14-XP step |
| --- | --- | ---: |
| 1 | A simple clue about the next action | 2 XP |
| 2 | More specific guidance about the operation and target | 5 XP |
| 3 | The actual, state-aware answer command | 7 XP |

The same service handles built-in and published instructor-created individual
missions. Instructors can optionally customize a step's first-layer Clue;
empty Clues use the automatic system. Guidance and Answer remain automatic.
See [the instructor Clue update](OPTIONAL_INSTRUCTOR_CLUES_AND_BILINGUAL_CONTROLS.md).
A layer can be purchased
only after the earlier layers. Future, finished, expired, and other students'
steps are protected. A failed request does not record a purchase.

The server verifies the next command against the existing mission command gate
and the live repository before offering any layer. Instructions without a
reliably determined command produce an explanatory error and cost no XP.
For a compound step, such as creating and committing a file, the unlocked answer
can be refreshed to show creation, then staging, then commit without a new fee.

Purchases survive page reloads and workspace resets. Reopening any paid layer
is free. Requests specify a layer, so simultaneous clicks or network retries
cannot advance to another paid layer accidentally. A transaction locks the
mission run and updates one cumulative purchase record per step.

## XP rules

The original per-step weighted schedule remains unchanged. A mission with
reward `R` and `N` steps assigns weight `N + i` to zero-based step `i`; proportional
shares are rounded by largest remainders so their sum is exactly `R`.
Each step's budget is then apportioned between layers using weights `1, 2, 3`
and the same whole-number principle. Costs are nondecreasing within a step.
Small rewards can produce zero-cost layers, while the total still stays exact.

For the 100-XP, five-step Git Basics mission:

| Step | Layer 1 | Layer 2 | Layer 3 | Total |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2 | 5 | 7 | 14 |
| 2 | 3 | 6 | 8 | 17 |
| 3 | 3 | 7 | 10 | 20 |
| 4 | 4 | 8 | 11 | 23 |
| 5 | 4 | 9 | 13 | 26 |
| All steps | 16 | 35 | 49 | 100 |

After only the first step's layers, available XP is `98`, then `93`, then `86`.
Using all three layers on every step gives **0 mission XP**. Account XP earned
elsewhere is unchanged. Successful submission awards only the unused reward;
normal validation, deadlines, and one-time reward rules remain intact.

Historical attempts that already debited the older immediate 10-XP hint charge
keep that accounting and are never charged twice. An old attempt without any
paid hints joins the deferred reward system on its first purchase.

## Git Flow Lab

The lab uses the application's orange palette in light and dark mode. Every
command has explicit before/after state, visible preparation, and replay.
Moving tokens depict copies or commits; working files remain in place when
staged. Commit nodes A–E are diagram identifiers rather than real SHA hashes,
and terminal results are explanatory summaries.

| Command | Illustrated effect |
| --- | --- |
| `git init -b main` | Creates local metadata and unborn main; no commit or remote |
| `git clone` | Separate start: copies history, configures origin, checks out files |
| `git status` | Reports the existing edit without changing repository state |
| `git add app.js` | Copies app.js v2 to the index; working file remains |
| `git commit` | Records C, advances main/HEAD; index now matches HEAD |
| `git push origin main` | Transfers C and updates remote main and local origin/main |
| `git pull --ff-only origin main` | Fetches teammate D, advances main and updates files |
| `git branch feature/login` | Adds a reference at D; HEAD stays on main |
| `git checkout feature/login` | Switches HEAD; both branches at D have identical files |
| `git merge feature/login` | After E and return to main, advances main to E and brings login.js; remote stays D |

These examples contain a single ancestor chain. Fast-forward merge adds no
commit and does not automatically push. The lab remains an isolated simulation
and does not execute student terminal commands or award XP.

## Verification

- `npm run mission-hints:test`: access control, sequential layers, no early
  answer disclosure, concurrent requests, persistence, compound commands,
  built-in/custom missions, and historical accounting.
- `npm run hint-xp:test`: all permitted reward/step combinations, integer
  layer budgets, partial/full purchases, completion and one-time rewards.
- `npm run flow-lab:test`: all ten commands compared with real Git repositories,
  including HEAD, branch refs, remote history, index changes and file snapshots.
- `npm run verify`: the existing application regression suite plus the lab test.

Database schema validation and Prisma client generation also pass. Running
Docker/Gitea and applying this migration against your existing database are
host checks; the tests above use isolated fixtures and preserve your services.
Browser checks also pass for partial and full hint reloads, exact 2/5/7 costs,
English/Bangla switching, light/dark controls, all ten animated scenes, replay,
sound, and a 390-pixel layout, without JavaScript errors.
