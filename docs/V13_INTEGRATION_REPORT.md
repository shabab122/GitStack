# GitStack v13 Integration Report

> **Historical version note:** This file documents an earlier GitStack milestone. The final v1.0.0 collaboration implementation supersedes its Gitea/future-phase limitations. See `README.md`, `docs/COLLABORATION_COMPLETE.md`, and `RUN_COMMANDS.md` for current behavior.


## Preserved
The previous complete Docker/sandbox baseline and existing learning pages are retained, including the v12 fixes made during sandbox troubleshooting. The sandbox API, WebSocket terminal, Docker image, PostgreSQL foundation and previous authentication routes remain available.

## Added
- Student dashboard frontend pages
- Student dashboard REST API
- MissionRun lifecycle
- Individual mission sandbox setup
- Repository-state validation
- Bangla feedback persistence
- XP award persistence
- Progress and attempt history
- Team activity read model
- Student profile/password APIs
- AES-256-GCM encrypted user profile storage
- Lookup HMAC fields and migration
- Existing-user encryption backfill

## Upgrade-safe database work
Migration `20260807143000_student_dashboard_and_encryption` only adds columns/indexes. Existing users are backfilled by `scripts/encrypt-existing-users.js` after migration deployment.

## Known boundary
The student dashboard exposes team assignments, but real Gitea repository/PR/review automation is intentionally not fabricated here. That requires the Gitea/instructor collaboration milestone from the project roadmap.
