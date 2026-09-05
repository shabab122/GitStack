import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  decryptUserValue,
  encryptUserValue,
  lookupHash
} from "../services/security/user-data-crypto.js";

const requiredPages = [
  "public/student-dashboard.html",
  "public/student-missions.html",
  "public/student-mission.html",
  "public/student-progress.html",
  "public/student-assessment.html",
  "public/student-team.html",
  "public/student-profile.html"
];

for (const page of requiredPages) {
  assert.equal(existsSync(page), true, `${page} is missing`);
}

const encrypted = encryptUserValue("student@example.com");
assert.notEqual(encrypted, "student@example.com");
assert.match(encrypted, /^enc:v1:/);
assert.equal(decryptUserValue(encrypted), "student@example.com");
assert.equal(lookupHash("STUDENT@example.com", "email"), lookupHash("student@example.com", "email"));

const authSource = readFileSync("public/auth.js", "utf8");
assert.match(authSource, /student-dashboard\.html/);
const studentRouter = readFileSync("routes/student-routes.js", "utf8");
assert.match(studentRouter, /mission-runs\/.*submit/);
assert.match(studentRouter, /xpAwarded/);
assert.match(studentRouter, /Mission time expired/);
assert.match(studentRouter, /TIMED_OUT/);
const schema = readFileSync("prisma/schema.prisma", "utf8");
assert.match(schema, /emailLookupHash/);
assert.match(schema, /attemptNumber/);

console.log("Student dashboard structure, encrypted profile helpers and mission workflow checks passed.");
