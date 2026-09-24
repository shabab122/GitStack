import fs from "node:fs";
const route=fs.readFileSync("routes/student-routes.js","utf8");
function assert(x,m){if(!x)throw new Error(m);}
assert(route.includes('Number(run.progressPercent || 0) < 100'),"submit must require 100% live progress");
assert(route.includes("const validation = await validateMission"),"final validation missing");
assert(route.includes('code: "MISSION_VALIDATION_MISMATCH"'),"integrity mismatch guard missing");
assert(route.includes("progressPercent: Number(run.progressPercent || 0)"),"mismatch must preserve live progress");
assert(!route.includes("progressPercent: validation.passed ? 100 : validation.score"),"partial score can still overwrite progress");
assert(route.includes("validation.score = 100"),"passing assessment not normalized to 100");
assert(route.includes('status: validation.passed ? "COMPLETED" : "IN_PROGRESS"'),"completion status persistence missing");
assert(route.includes("progressPercent: 100"),"completed progress not persisted as 100");
console.log("Checkpoint 31 final submission integrity regression test passed.");
