import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

function source(file) {
  assert.equal(existsSync(file), true, `${file} is missing`);
  return readFileSync(file, "utf8");
}

const missionHtml = source("public/student-mission.html");
const missionJs = source("public/student-mission.js");
const seed = source("prisma/seed.js");
assert.doesNotMatch(missionHtml, /Suggested commands|commandList/i, "Student mission UI still exposes command suggestions");
assert.doesNotMatch(missionJs, /suggestedCommands|commandList|clipboard\.writeText/i, "Student mission JS still implements command suggestions");
assert.doesNotMatch(seed, /suggestedCommands\s*:/, "Seed data still reintroduces command suggestions");

const schema = source("prisma/schema.prisma");
const migration = source("prisma/migrations/20260909224500_dynamic_missions/migration.sql");
assert.match(schema, /missionsCreated\s+MissionTemplate\[\]/, "User-to-dynamic-mission relation missing");
assert.match(schema, /createdById\s+String\?/, "MissionTemplate.createdById missing");
assert.match(migration, /MissionTemplate_createdById_fkey/, "Dynamic mission migration foreign key missing");

const instructorRoutes = source("routes/instructor-routes.js");
for (const route of [
  'router.post("/missions"',
  'router.patch("/missions/:id"',
  'router.delete("/missions/:id"',
  'router.get("/leaderboard"'
]) assert.match(instructorRoutes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(instructorRoutes, /Built-in system missions are read-only/, "System missions are not protected from dynamic editing");
assert.match(instructorRoutes, /hasEffectiveIndividualRule/, "Server-side dynamic validation rule guard missing");

const studentRoutes = source("routes/student-routes.js");
for (const route of [
  'router.get("/leaderboard"',
  'router.get("/team/candidates"',
  'router.post("/team"'
]) assert.match(studentRoutes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const leaderboardService = source("services/leaderboard/leaderboard-service.js");
for (const [rank, label] of [[1,"Diamond"],[2,"Platinum"],[3,"Gold"],[4,"Silver"],[5,"Bronze"]]) {
  assert.match(leaderboardService, new RegExp(`${rank}: \\{[^\\n]*label: "${label}"`), `${label} rank milestone missing`);
}
assert.match(leaderboardService, /contributionScore/, "Contributor scoring missing");

const studentDashboard = source("public/student-dashboard.html");
const instructorDashboard = source("public/instructor-dashboard.html");
assert.match(studentDashboard, /id="studentLeaderboard"/, "Student XP leaderboard missing");
assert.match(instructorDashboard, /id="instructorXpLeaderboard"/, "Instructor Top rated leaderboard missing");
assert.match(instructorDashboard, /id="instructorContributorLeaderboard"/, "Instructor Top contributors leaderboard missing");

const instructorMissions = source("public/instructor-missions.html");
assert.match(instructorMissions, /id="openMissionModal"/, "Dynamic mission Create button missing");
assert.match(instructorMissions, /id="missionForm"/, "Dynamic mission form missing");
assert.match(instructorMissions, /Automatic validation rules/, "Dynamic mission rule builder missing");

const studentTeam = source("public/student-team.js");
assert.match(studentTeam, /\/api\/student\/team\/candidates/, "Student teammate candidate API not used");
assert.match(studentTeam, /method:\s*"POST"/, "Student self-form team action missing");

const instructorTeams = source("public/instructor-teams.js");
assert.match(instructorTeams, /Student-formed/, "Instructor cannot distinguish student-formed teams");
assert.match(instructorTeams, /contributionScore/, "Instructor team selection does not use performance evidence");

const themeJs = source("public/theme.js");
const themeCss = source("public/theme.css");
assert.match(themeJs, /gitstack-theme/, "Theme persistence missing");
assert.match(themeJs, /topbar-brand/, "Authenticated GitStack header brand missing");
assert.match(themeCss, /html\[data-theme="dark"\]/, "Dark theme CSS missing");

const htmlPages = readdirSync("public").filter((name) => name.endsWith(".html"));
for (const page of htmlPages) {
  const html = source(`public/${page}`);
  assert.match(html, /href="theme\.css"/, `${page}: theme.css missing`);
  assert.match(html, /src="theme\.js"/, `${page}: theme.js missing`);
}

const dashboardCss = source("public/dashboard-v15.css");
for (const badge of ["diamond","platinum","gold","silver","bronze"]) {
  assert.match(dashboardCss, new RegExp(`milestone-${badge}`), `${badge} badge styling missing`);
}
assert.match(dashboardCss, /Higher-contrast dashboard text and controls/, "Dashboard text visibility layer missing");

console.log(`V15 feature update checks passed across ${htmlPages.length} HTML pages.`);
