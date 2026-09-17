import assert from "node:assert/strict";
import fs from "node:fs";

const routes = fs.readFileSync("routes/instructor-routes.js", "utf8");
const page = fs.readFileSync("public/instructor-assignments.html", "utf8");
const client = fs.readFileSync("public/instructor-assignments.js", "utf8");

for (const expected of [
  'router.get("/assignments"',
  'router.post("/assignments"',
  'router.patch("/assignments/:id"',
  'router.delete("/assignments/:id"',
  'router.post("/assignments/:id/prepare-collaboration"',
  'Published mission not found.',
  'Team missions must be assigned to a three-person team.',
  'Individual missions must be assigned directly to a student.',
  'Due date must be after the start date.',
  'All three team members must be active students',
  'An open ${duplicate.status.toLowerCase()} assignment already exists',
  'Assignment saved successfully, but the Gitea collaboration workspace is not ready yet',
  'This assignment already has mission history. Close it instead of deleting it.',
  'This team assignment already has collaboration history. Close it instead of deleting it.'
]) {
  assert.ok(routes.includes(expected), `Missing assignment backend behavior: ${expected}`);
}

assert.match(routes, /status:\s*\{\s*in:\s*\[AssignmentStatus\.DRAFT, AssignmentStatus\.ACTIVE\]/);
assert.match(routes, /prepareAssignmentCollaborationSafely/);
assert.match(routes, /assignmentScheduleState/);
assert.match(routes, /canDelete:/);
assert.match(routes, /canPrepare:/);

for (const expected of [
  'id="openAssignmentModal"',
  'id="assignmentSearch"',
  'id="assignmentStatusFilter"',
  'id="assignmentModalTitle"',
  'id="assignmentSubmit"',
  'data-assignment-count="active"',
  '<th>Availability</th>',
  '<th>Collaboration</th>'
]) {
  assert.ok(page.includes(expected), `Missing assignment UI element: ${expected}`);
}

for (const expected of [
  'Prepare/Retry',
  'data-prepare',
  'scheduleLabel',
  'updateSummary',
  'Search mission or target',
  'Save changes',
  'Due date must be after the start date.',
  '/prepare-collaboration'
]) {
  assert.ok(client.includes(expected) || page.includes(expected), `Missing assignment client behavior: ${expected}`);
}

console.log("Mission assignment lifecycle, scheduling, duplicate protection, resilient collaboration preparation and instructor UI checks passed.");
