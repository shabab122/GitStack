# System-generated mission command hints (v35)

Individual mission workspaces show **Hint · −10 XP** only on the active
unfinished step. A click reveals the next system-verified command and immediately
debits 10 XP from that student. The charge can take XP below zero, so a new
student cannot obtain free hints by having a zero balance. Existing XP-based
leaderboard rankings reflect the updated total. Mission rewards still pay out
on a valid completion, and previously completed attempts still cannot award
the same mission reward twice.

Each student pays once per step per mission attempt. Refreshing the command
after completing part of that same step or resetting the same attempt is free;
a new retry is a new attempt. Completed and future steps, expired attempts,
team missions, and submitted runs cannot call the hint endpoint. A database
transaction locks the mission run, checks live progress, records the unlock
once with a unique key, and applies the XP debit atomically. Blocking a wrong
terminal command no longer gives away the exact next command for free.

The system compiles the active mission step into accepted command families,
checks the real sandbox repository and the current terminal step evidence,
then verifies a concrete candidate against the same sequential command gate
used by the student terminal. For example, in a combined create-and-commit
step it suggests `touch file`, then `git add file`, then `git commit` as the
student's repository changes. A merge hint uses an existing branch name from
that repository. Instructors and students do not write hint answers.

The gate often accepts several correct commands, so there is no unique exact
string to fetch. The system selects one command it can verify. If it cannot
derive a reliable command for an unusual mission state, it does **not** charge
XP and asks the student to check the step and reconnect. Built-in and
published-mission progress/completion rules remain unchanged.

## Upgrade the existing installation

1. Keep the existing PostgreSQL and Docker volumes. Copy the current `.env`
   into this release, including the same encryption and authentication keys.
2. From `GitStack-main`, run `npm ci`, `npm run db:validate`,
   `npm run db:generate`, **`npm run db:deploy`**, and
   `npm run mission-hints:test`.
3. Restart the application with the normal command. The v34 migration adds a
   paid-hint usage table and a legacy nullable `stepHints` column. The column
   is now ignored; retaining it avoids editing an already-applied migration
   or deleting any existing data. Existing users, XP, missions, runs, and
   assessments remain intact. Do not run `db:seed` for this upgrade.

The ZIP has no `.env` or `node_modules`. A live PostgreSQL migration and
Docker/browser acceptance run must be performed on the deployment host;
the included regression test uses temporary local Git repositories, the real
command gate, a simulated row lock and HTTP routes.

**Team collaboration** has a separate Gitea role workflow and does not use
the individual terminal's ordered step checklist. It retains its existing
role guidance; the paid Hint button is for the built-in, assigned, and
instructor-created **individual** missions with active steps.
