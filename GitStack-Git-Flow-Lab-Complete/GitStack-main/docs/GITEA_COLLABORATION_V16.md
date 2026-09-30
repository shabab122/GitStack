# GitStack Gitea Collaboration Extension

Added capabilities:

- Gitea service container
- Repository creation API
- Pull request API foundation
- Repository lookup
- Team repository integration foundation
- Future contribution score hooks through Git events

Workflow:

Student team -> Instructor creates/assigns project -> Repository created in Gitea -> Students push changes -> Pull requests -> Review -> Merge -> Git events update contribution metrics.

Setup:

1. Start services:
   docker compose up -d

2. Configure Gitea token in .env

3. Connect GitStack backend with Gitea API.

This extension preserves existing student, instructor, sandbox and database workflows.
