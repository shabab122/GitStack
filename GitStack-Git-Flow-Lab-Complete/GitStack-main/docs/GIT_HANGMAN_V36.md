# Git Hangman (v36)

The independent Sandbox Playground entry on the student dashboard now opens
`/git-hangman.html`. The bare `/sandbox-terminal.html` URL redirects there for
old bookmarks. URLs with `mission`, `sandbox`, `assignment`, or `collaboration`
context still open the original Docker terminal. Team Activity uses its
existing assignment and sandbox URL unchanged.

The game is an original GitStack word puzzle with 24 Git terms, three
difficulties, English and Bangla clues, a free second clue, physical and
on-screen keyboards, win/loss feedback and a brief Git explanation after each
round. Its practice record lives in the browser session. It has no account,
Docker, database, mission XP, or leaderboard integration.

The v35 mission terminal, paid step hints, published mission validation,
Docker sandbox APIs and Gitea collaboration workflow are unchanged. There is
no database migration in v36. The existing `.env` and Docker/PostgreSQL
volumes should remain in place during an upgrade. The complete source ZIP
does not include `.env` or `node_modules`.

From the extracted `GitStack-main` directory, run `npm ci`,
`npm run hangman:test`, `npm run mission-hints:test`,
`npm run published-runtime:test` and `npm run student:collaboration:test`.
The new game test checks all curated terms, hint and outcome rules, and that
standalone terminal navigation redirects while mission/team contexts remain.

Live browser layout and Docker/Gitea acceptance still depend on the deployment
host. For full host verification use `npm run acceptance:host` after the normal
services are running.
