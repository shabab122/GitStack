# Optional instructor Clues and bilingual controls

## Mission authoring

The three existing hint layers remain Clue → Guidance → Answer. Instructors
may customize **only the first layer** for any of their individual mission
steps. All fields are optional; a ten-step mission does not require thirty
authored hints.

1. Create or edit an individual mission as usual.
2. Expand **Customize Clues (optional)**, then the step you want to customize.
3. Write a short conceptual Clue in English or Bangla. A separate Bangla
   version is optional; one supplied language is used in both modes otherwise.
4. Review **Student Clue preview**, then save the mission.

Every empty step uses the system's automatic Clue. Guidance and the live,
verified answer command always come from the system. Remove both language
fields and save to restore automatic Clues. The editor preserves unchanged
objectives when they move; changing an objective clears its old Clue. Team
mission creation, validation and collaboration retain their existing behavior.

## Priority, XP and persistence

| Layer | Source | Cost for a 14-XP step |
| --- | --- | ---: |
| 1 | Instructor Clue when present, otherwise automatic Clue | 2 XP |
| 2 | Automatic Guidance | 5 XP |
| 3 | Automatic verified command | 7 XP |

The source of a Clue does not change its cost. Sequential unlocks, free
reviews, reward snapshots, legacy purchases and zero-XP completion retain the
existing rules. Student mission detail/list responses do not include authored
Clues; only purchased layers are sent by the hint endpoint. Failed requests
are not charged.

The instructor API accepts optional `stepClues`, an array aligned with `steps`.
Each item is `null` or `{ "text": "...", "textBn": "..." }`. Both text fields
are optional and limited to 600 characters. Omitting `stepClues` on an update
preserves customization; explicit empty entries restore automatic Clues.
Instructor ownership checks still apply.

Storage uses a versioned object in the **existing** `MissionTemplate.stepHints`
JSON column, bound to each objective. Historical single-hint arrays remain
ignored because they may contain complete answers. This addition needs no
new database migration. The previous three-layer migration remains included
for installations that have not yet applied it.

## English and Bangla behavior

Public signup/login controls use real destinations; auth routing no longer
depends on English button text. Role selection and direct auth switch links
retain their existing workflow. Translation preserves option values, including
options added dynamically, so filters and form payloads stay stable. The
assignment status filter also declares its explicit values in HTML. The
landing and learning page command previews preserve executable Git/shell
syntax in both languages. The
standalone terminal page now includes the shared EN/BN control and language
script without changes to terminal execution or collaboration services.

## Verification and upgrade

- `npm run verify` includes the new `instructor-clues:test` plus existing
  mission, XP, assignment, collaboration, Hangman, timer and Git Flow Lab checks.
- Hint endpoint tests exercise instructor priority, no unpaid-Clue disclosure,
  automatic Guidance/Answer, concurrent purchases and unchanged XP costs with
  real Git in temporary repositories.
- Browser checks use the real frontend and local test fixtures for public auth
  entries, instructor create/edit/preview/save/reload/removal, translated
  dropdowns, page language round-trips, themes and the mobile editor. Student
  hint controls and all ten Git Flow scenes are checked separately.
- Live Docker/Gitea integration is not deployed or exercised by these local
  checks. Their services, credentials, routes and terminal code are unchanged.

Use the existing `.env`, database and Gitea volumes. Follow `RUN_COMMANDS.md`
for normal startup; application/Gitea ports remain 3000/3002. No seed or volume
reset is needed for this update.
