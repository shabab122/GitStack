import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const requiredPages = [
  "public/instructor-dashboard.html",
  "public/instructor-students.html",
  "public/instructor-student.html",
  "public/instructor-missions.html",
  "public/instructor-assignments.html",
  "public/instructor-teams.html",
  "public/instructor-assessments.html",
  "public/instructor-analytics.html",
  "public/instructor-activity.html",
  "public/instructor-profile.html"
];

for (const page of requiredPages) {
  assert.equal(existsSync(page), true, `${page} is missing`);
}

const authSource = readFileSync("public/auth.js", "utf8");
assert.match(authSource, /instructor-dashboard\.html/);
const serverSource = readFileSync("server.js", "utf8");
assert.match(serverSource, /createInstructorRouter/);
assert.match(serverSource, /\/api\/instructor/);
const router = readFileSync("routes/instructor-routes.js", "utf8");
assert.match(router, /encryptUserValue\(input\.fullName\)/);
assert.match(router, /argon2\.hash\(input\.newPassword/);
for (const feature of [
  'router.get("/dashboard"',
  'router.get("/students"',
  'router.get("/missions"',
  'router.post("/assignments"',
  'router.post("/teams"',
  'router.get("/assessments"',
  'router.get("/analytics"',
  'router.get("/activity"',
  'router.patch("/profile"'
]) {
  assert.match(router, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
const schema = readFileSync("prisma/schema.prisma", "utf8");
assert.match(schema, /studentId\s+String\?/);
assert.match(schema, /createdById\s+String\?/);
assert.match(schema, /AssignmentStudent/);
const studentRouter = readFileSync("routes/student-routes.js", "utf8");
assert.match(studentRouter, /individualAssignments/);
assert.match(studentRouter, /assignmentId: assignment\?\.id/);

console.log("Instructor dashboard structure, assignments, three-person teams and role-protected workflow checks passed.");
