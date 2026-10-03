# Individual work reviews and dashboard notifications

Students in an instructor-created team with an assigned Gitea repository can request private feedback on their own contribution. The team creator receives the request; teammates and other instructors cannot read it.

## Student workflow

1. Push the work to the assigned team repository.
2. Open **Work reviews** from the sidebar, dashboard or **Request instructor review** in Team Activity.
3. Choose the team repository and optionally its assignment. Enter a short title, explain your contribution and questions, and select a branch, commit SHA or Pull Request number.
4. Optionally list exact repository-relative file paths, one per line, to identify the portion to focus on.
5. Send the request. Gitea verifies the reference and GitStack saves the submitted commit snapshot. The instructor receives a bell notification.
6. Read the instructor's outcome and written feedback from the dashboard card, bell notification or review history. After requested changes, push the revision and send a new request.

Each eligible team appears separately, including teams managed by different instructors. A student chooses the intended team before submitting. Teams without an active instructor or assigned repository cannot accept new requests. Previously received feedback remains in the student's own history after leaving a team.

## Instructor workflow

1. Open the bell notification or **Work reviews**.
2. Read the student's contribution, requested file scope and submitted snapshot.
3. Open **Submitted changes in Gitea** for the complete change. The branch/PR link also provides its current state; the saved snapshot always refers to the submitted version.
4. Choose **Reviewed**, **Approved** or **Changes requested**, write feedback, and send it.
5. Only the requesting student receives the feedback notification. The result and reply persist across refreshes and restarts.

Reviews store their snapshot SHA, base SHA, affected file list and a text preview of the latest submitted commit. The preview is limited to 60,000 characters; it is explicitly labelled as the latest commit, rather than the full branch/PR diff. The full submitted-change link uses pinned SHAs. Large branch/PR requests should be narrowed to a specific commit. Fork PRs outside the assigned repository are rejected.

This feedback does not submit a native Gitea PR approval, merge code, modify files, award XP or change automatic assessments. Existing peer-review and collaboration requirements continue to operate independently.

## Notifications and assignments

Both dashboard shells include a bell with an unread badge, notification history, individual read state, **Mark all read**, and older-item pagination. Opening a review marks its notification read. Notifications update while the dashboard is visible, with a 30-second polling interval and a refresh when the tab regains focus or the bell opens.

Students receive notifications for active individual assignments and active assignments for any team they belong to. Active assignments also appear in **Instructor assignments** on the student dashboard. Assignment links highlight that section; team links select the team belonging to the requested assignment. Draft assignments produce no student notification until activated.

Assignment notifications are synchronized from existing assignment records, independently of their creation, Gitea preparation or assessment. Existing active assignments appear on the first notification refresh. A unique recipient/assignment key prevents duplicate notifications on polling, refresh or activation retries.

English/Bangla controls and light/dark themes work on both new review pages and the shared bell. Author-entered code, titles and feedback retain their original wording. Language changes preserve unsent form values.

## Upgrade an existing installation

Keep the existing `.env` and existing Docker/database volumes. From the project root with GitStack PostgreSQL running:

```bash
npm run db:generate
npm run db:deploy
npm run verify
```

Restart GitStack afterwards. Migration `20261003173000_work_reviews_notifications` adds only the `WorkReviewStatus` enum, `WorkReviewRequest` and `DashboardNotification` tables with indexes and foreign keys. It does not alter existing table columns, delete or rewrite records, reseed missions, or touch the separate Gitea database. Existing relationships use `SET NULL` for review history, so the new feature does not prevent the established team/assignment deletion flows.

## Access and reliability

- Authentication is required for every review and notification endpoint. Students can request reviews only for their current teams; the instructor is selected by the server from the team creator.
- Review lists, details, replies and notification read actions are restricted to their recipient. A supplied instructor ID or repository URL is not accepted.
- Request creation and its instructor notification are one database transaction. Replies and student notifications are also atomic.
- Browser retries reuse a request key. Concurrent pending requests for the same student's team/commit reuse the existing request. Identical feedback retries reuse the stored reply; conflicting subsequent replies return an error.
- Gitea evidence access is read-only. Invalid/unpushed references, unmatched file paths and unavailable Gitea return a useful error without saving a request.
- Profile encryption settings, credentials, Docker configuration, existing migration files, mission hints and XP calculations remain unchanged.

## Verification

`npm run reviews:test` exercises the authenticated Express routes with disposable fixtures: ownership, private replies, duplicate/concurrent retries, rollback, assignment recipients, draft activation, pagination, read state, missing references and Gitea outages. It runs as part of `npm run verify` and requires no live database or Gitea credentials.

The release was also checked with a disposable SQL database through the actual Prisma client and both dashboards in a browser. That check covers the additive migration with pre-existing records, request-to-feedback flow, snapshot persistence, literal code rendering, both languages/themes and mobile layouts. Production Docker/Gitea services must still be checked in the installation's own environment.
