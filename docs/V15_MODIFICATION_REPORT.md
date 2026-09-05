# GitStack V15 Modification Report

## Base version

V15 was created directly from the user-provided stable **GitStack-v14** project. This is an update, not a rebuild.

## Preserved systems

The following V14 areas were intentionally not redesigned or migrated:

- Express server and API routes
- PostgreSQL + Prisma schema/migrations
- encrypted student/instructor account storage
- JWT/HttpOnly-cookie authentication
- Student Dashboard workflows
- Instructor Dashboard workflows
- mission runs, assessment, feedback and XP
- team/assignment backend logic
- Docker sandbox image and lifecycle
- WebSocket browser terminal

No V15 Prisma migration is required.

## V15 changes

### Dashboard-wide bilingual support

The existing `public/language.js` is extended and reused. V15 adds the EN/BN selector to every student and instructor dashboard page. The chosen language persists under `gitstack-language` in localStorage. A MutationObserver now covers content inserted after API calls, so dashboard cards, statuses, assignments and other dynamically rendered interface text can follow the selected language.

### Navigation behavior

The `Public site` button was removed from all authenticated student and instructor sidebars. The account action area now exposes only Logout.

Mobile sidebars now include an accessible backdrop, Escape-to-close behavior, closing after a navigation selection and `aria-expanded` state on the mobile menu button.

### Professional responsive dashboard styling

`public/dashboard-v15.css` is a non-destructive override layer loaded after the existing V14 dashboard CSS. It adds:

- subtle glassmorphism and blur
- improved card hierarchy and shadows
- hover/active/click feedback
- accessible focus-visible rings
- roomier profile forms
- improved top bars and sidebars
- touch-friendly minimum button/input sizes
- responsive mobile/tablet behavior
- reduced-motion support

### Returning-account sign-in assistance

After a successful student/instructor signup or login, GitStack remembers the most recently used account identifier/display name for that role. The password is **not** written to localStorage/sessionStorage. On the next login page visit, a returning-account suggestion appears. Selecting it fills the account identifier and, when the browser supports it and the user has saved the password, invokes the browser credential/password-manager flow to fill the password securely.

## Verification

V15 includes `npm run ui:test`. It checks:

- all student/instructor dashboard pages load the V15 style layer
- every dashboard has EN/BN controls and `language.js`
- authenticated dashboard pages no longer contain the Public Site shortcut
- login autocomplete semantics remain present
- returning-account support uses browser credentials and does not store passwords in localStorage
- dynamic translation support is present
- all local CSS/JS references from all HTML pages resolve

Additional existing tests retained:

- `npm run check`
- `npm run student:test`
- `npm run instructor:test`
- `npm run terminal:test`
- `npm run sandbox:doctor`
- `npm run sandbox:test`

Docker-daemon checks must be run on the target Ubuntu machine because the artifact-generation environment does not provide Docker CLI/daemon access.
