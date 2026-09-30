import fs from "node:fs";
import path from "node:path";

function assert(x,m){if(!x)throw new Error(m);}
const ui=fs.readFileSync(path.resolve("public/student-mission.js"),"utf8");
const terminal=fs.readFileSync(path.resolve("services/sandbox/terminal-manager.js"),"utf8");

// Backend must publish a dedicated progress event after repository observation.
assert(/type:\s*"mission-progress"/.test(terminal),"terminal manager does not publish mission-progress");
assert(/publishMissionProgress/.test(terminal),"terminal manager has no progress publisher");
assert(/observeMissionCommand/.test(terminal),"terminal manager is not observing executed mission commands");
assert(/progressPercent/.test(terminal) && /completedSteps/.test(terminal),"progress payload is incomplete");

// Browser must consume the live event directly, without a reload.
assert(/message\.type\s*===\s*"mission-progress"/.test(ui),"browser does not consume mission-progress");
assert(/renderMissionProgress\(message\)/.test(ui),"browser does not render the received progress event");
assert(!/message\.type\s*===\s*"mission-progress"[\s\S]{0,500}(location\.reload|window\.location\.reload)/.test(ui),
  "progress event incorrectly requires page reload");

// Checklist contract: completed -> green class, active -> current/red class, later -> locked.
assert(/index\s*<\s*completed\s*\?\s*"step-complete"/.test(ui),"completed step mapping missing");
assert(/index\s*===\s*completed[\s\S]{0,100}"step-current"/.test(ui),"current step mapping missing");
assert(/"step-locked"/.test(ui),"locked step mapping missing");

// Percentage must be updated immediately from the event.
assert(/el\.progressText\.textContent\s*=\s*`\$\{percent\}%`/.test(ui),"live percentage text update missing");
assert(/el\.progressBar\.style\.width\s*=\s*`\$\{percent\}%`/.test(ui),"live progress bar update missing");

// Progress feedback must stay out of the terminal stream, preventing prompt corruption/Ctrl+C behavior.
const progressHandler=ui.slice(ui.indexOf('if (message.type === "mission-progress")'),
  ui.indexOf('if (message.type === "error")'));
assert(!/append\(/.test(progressHandler),"mission-progress appends asynchronous text into terminal");
assert(/G\.toast/.test(progressHandler),"successful progress has no unobtrusive UI feedback");

console.log("Checkpoint 30 live browser/UI synchronization regression test passed.");
