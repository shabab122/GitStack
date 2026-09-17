# Contributing to GitStack

Use one issue per change, one feature/fix branch per issue, small meaningful commits and a reviewed Pull Request before merge. Include the acceptance scenario and test evidence in the PR. Do not commit `.env`, access tokens, passwords or generated user data.

Recommended branch prefixes: `feature/`, `fix/`, `docs/`, `test/`.

Before opening a PR run:

```bash
npm run verify
npm run db:validate
```

When Docker/Gitea behavior changes, also run the sandbox/Gitea checks from `RUN_COMMANDS.md` on an Ubuntu host.
