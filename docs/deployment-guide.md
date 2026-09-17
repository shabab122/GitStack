# Local Deployment Guide

GitStack's final MVP is designed for a controlled Ubuntu laboratory/demo machine.

## Services

- GitStack Node/Express: host port 3000
- GitStack PostgreSQL: host port 5432
- Gitea: host port 3002 (container 3000)
- Gitea SSH: host port 2222
- Gitea PostgreSQL: internal Compose network only
- Collaboration sandboxes: private `gitstack-sandbox-network`

## Important upgrade rule

When reusing an existing GitStack application database, preserve the previous `.env` and especially `DATA_ENCRYPTION_KEY`.

## Deployment

Follow `RUN_COMMANDS.md`. `npm run setup -- --rebuild` is the preferred clean setup path.

Gitea requires a one-time local administrator/token setup. Store only the token in `.env`; never commit it. Use `npm run gitea:doctor` after token changes.

## Backup

Before database/container changes, back up the GitStack PostgreSQL volume/database and Gitea data/DB. Do not use `docker compose down -v` during normal operation.
