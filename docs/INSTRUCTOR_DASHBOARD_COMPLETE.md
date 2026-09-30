# Instructor Dashboard V1 — Completed Scope

> **Historical version note:** This file documents an earlier GitStack milestone. The final v1.0.0 collaboration implementation supersedes its Gitea/future-phase limitations. See `README.md`, `docs/COLLABORATION_COMPLETE.md`, and `RUN_COMMANDS.md` for current behavior.


## Purpose

The Instructor Dashboard implements the instructor goals in the GitStack project plan that can be completed before Gitea integration: assign students to three-person teams, assign predefined missions, monitor progress, review individual assessment results, and identify common workflow mistakes.

## Pages

1. `instructor-dashboard.html` — overview and quick actions
2. `instructor-students.html` — searchable student directory
3. `instructor-student.html` — individual student report
4. `instructor-missions.html` — predefined mission catalogue + performance
5. `instructor-assignments.html` — individual/team mission assignment management
6. `instructor-teams.html` — exact three-person teams with unique roles
7. `instructor-assessments.html` — repository-state assessment review
8. `instructor-analytics.html` — MVP-level class analytics
9. `instructor-activity.html` — application activity feed
10. `instructor-profile.html` — encrypted profile + password change

## Authentication and encryption

Instructor signup/login use the same hardened account system as student accounts:

- Argon2id password hashes
- AES-256-GCM encrypted profile fields
- HMAC lookup hashes for email and university ID
- HttpOnly JWT cookie
- Backend role checks on every `/api/instructor/*` endpoint

Registration/login redirects instructors directly to `instructor-dashboard.html`.

## Team management

A new team requires exactly three active students. The API rejects duplicate students, students already in another team, and duplicate team roles. The three roles are:

- `FEATURE_DEVELOPER`
- `TEST_DEVELOPER`
- `CODE_REVIEWER`

New teams store `createdById` so instructors manage their own team definitions.

## Mission assignment

Predefined individual missions are assigned directly to students. Team missions are assigned to three-person teams. Assignments support:

- DRAFT / ACTIVE / CLOSED status
- optional start date
- optional due date
- update / close
- deletion only when no mission-run history exists

The Student Dashboard now surfaces active direct assignments. When a student starts the matching individual mission, the new MissionRun records the Assignment ID.

## Assessment and analytics

Instructor pages read actual `MissionRun`, `AssessmentResult`, `Feedback`, `User`, `Team`, `Assignment` and `SandboxSession` data. Common mistakes are calculated from failed assessment rule results rather than fabricated values.

The project plan excludes advanced analytics from the MVP, so this dashboard intentionally provides understandable summary cards, mission performance, XP bands, pass rate and repeated failed checks rather than an oversized BI system.

## What intentionally waits for Gitea

- Gitea repository creation
- Issues / Pull Requests / reviews
- branch and push webhook events
- team score derived from collaboration
- controlled merge conflict
- collaboration activity scoring

The team and assignment identifiers introduced here are the stable database foundation those Gitea features will use.
