# Student Collaboration Workspace

The Student **Team Activity** page is the working side of the instructor
collaboration report. Both dashboards read the same persisted MissionRun,
GitEvent and AssessmentResult data.

## Complete handoff

```text
Instructor prepares active team assignment
 -> student sees role, branch, issue and repository
 -> Start collaboration workspace creates a separate Docker clone
 -> student commits and pushes with their own Gitea account
 -> signed Gitea webhook stores actor/branch/PR/review/test/merge evidence
 -> assessment updates the student workspace and instructor report
 -> all three role results combine with the 30-point team workflow score
```

## Student safeguards

- The visible `G.roleLabel is not a function` failure is fixed in the shared
  student helper.
- Repository links accept only HTTP/HTTPS URLs.
- A missing or invalid linked Gitea account blocks workspace start with a clear
  action instead of creating a clone that cannot be pushed.
- The service credential is used only for the initial private clone and is
  immediately removed from the Git remote URL. Students authenticate pushes
  with their own username and personal access token.
- The assigned role branch is verified before the workspace is returned.
- Reset recreates the container workspace and restores the prepared clone.
- The existing Gitea container is connected to the private sandbox network
  without restarting or recreating it.

## Evidence visibility

Students can refresh the same 11 workflow stages shown to instructors:

1. Mission issue
2. Role branches
3. Meaningful commits
4. Branch pushes
5. Pull Requests
6. Specific review
7. Changes requested
8. Test evidence
9. Final approval
10. Ordered merges
11. Conflict resolution

Run `npm run student:collaboration:test` for the student workspace integration
contract, or `npm run verify` for the complete project suite.
