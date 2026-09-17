# Mission Design

## Individual missions

Individual validation is repository-state based. Supported generic rules include repository initialization, required/tracked file, commit count/message length, branch prefix/final branch and clean working tree. This lets students use any valid Git commands that produce the required state.

## Collaboration Basics

The final MVP ships one deliberately polished TEAM mission.

### Roles

- Feature Developer — feature branch, meaningful commits, issue-linked PR, response to requested changes.
- Test Developer — test branch, test changes/evidence, PR, deterministic conflict resolution.
- Code Reviewer — real Gitea review, requested changes, test verification and final approval/merge discipline.

### Deterministic conflict

Feature and Test branches are created before work begins. Both roles edit the same `AUTH_MODE` line differently. Feature is merged first. Updating the Test branch from main therefore creates a deterministic conflict. The required final state is `AUTH_MODE=secure-verified` without conflict markers.

### Automated test

The prepared repository includes `tests/verify-login-policy.sh`. After resolving the conflict the Test Developer runs it and records PASS in `tests/test-evidence.md`.

### Assessment

Role rules sum to 70 points. Shared team rules sum to 30 points. Total score is their sum; workflow completion is additionally required to pass.
