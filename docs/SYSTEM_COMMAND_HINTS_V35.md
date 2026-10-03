# System-generated mission hints and dynamic XP

This describes the original single-hint release. The current UI uses three
progressive layers per step; each step cost below is now the **total of its
three layers**. See [the current three-layer specification and upgrade](THREE_LAYER_HINTS_AND_FLOW_LAB.md).

Individual mission hints work on the student's **current unfinished step** in
both built-in and instructor-created missions. The system inspects the actual
repository and accepted step actions, then offers a verified next command.
Instructors cannot supply a separate command answer. Team collaboration uses
its existing role guidance and does not have individual step hints.

## XP allocation

The mission's XP reward is distributed across its ordered steps. Step weights
rise gradually from `N` for the first step to `2N - 1` for the last step,
where `N` is the number of steps. Each weight receives its proportional share
of the mission XP. Fractional XP is apportioned deterministically as whole
numbers; **the sum of all step costs always equals the mission reward**.

For example, a 100-XP, 8-step mission has hint costs of
`9, 10, 11, 12, 13, 14, 15, 16` XP. Without hints the student can earn
100 XP; using hints on steps 1 and 8 earns 75 XP; using a hint on every step
earns **0 XP**. The same full-hint rule applies to a 150-XP mission with 10
steps, a zero-XP mission and every supported instructor-created individual
mission. When mission XP is smaller than the number of steps, some hints can
cost 0 XP because whole-number charges must still sum to the mission reward.

A new attempt snapshots the mission's XP reward when it starts. Changing a
custom mission's advertised XP later cannot change an existing attempt's hint
budget. The mission checklist shows each step's cost and the XP still
available from the attempt.

On a new attempt, revealing a hint **does not debit existing account XP**.
It records a pending reduction of that attempt's reward. On successful
mission submission, GitStack awards the unused portion, from 0 up to the
original mission reward. An abandoned or timed-out attempt does not change
the account XP. The repository validator and completed/failed mission rules
are unchanged: a valid, fully hinted mission is **COMPLETED with 0 XP**.
The first successful completion claims that mission's one-time XP award even
when the awarded amount is zero; later practice attempts cannot farm XP.

## Hint behavior and upgrade safety

- One hint unlock per step per attempt. Reopening it after a command in a
  compound step can show the next verified command without another charge.
- Unavailable or unreliable hints are never recorded or charged. Completed,
  future and expired steps cannot request hints.
- Existing pre-upgrade attempts that **already paid** 10 XP per hint keep
  their immediate-charge behavior and receive their original completion
  reward; their existing charges are never subtracted again.
- An older active attempt with **no** paid hints joins the new reward system
  on its first verified hint. Existing completed runs and XP history remain
  unchanged.
- The application locks the attempt when recording hints and locks the
  attempt/user when awarding XP to prevent repeated hint charges or
  concurrent double awards.

The schema adds nullable `MissionRun.hintRewardXp` in migration
`20260928210000_dynamic_hint_xp`. Its null value identifies older attempts.
Existing hint-use records keep their original costs; no historical XP is
rewritten.

To upgrade an existing installation, keep its previous `.env`, PostgreSQL
and Gitea data. From the new project directory run:

```bash
npm ci
npm run db:validate
npm run db:generate
npm run db:deploy
npm run mission-hints:test
npm run hint-xp:test
npm run dev
```

Do not run `db:seed` or remove Docker volumes as part of this upgrade.
Database migration and Docker/Gitea runtime checks require the actual host
running those services.
