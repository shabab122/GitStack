import fs from "node:fs";
const text=fs.readFileSync(new URL("../services/sandbox/terminal-manager.js",import.meta.url),"utf8");
for(const token of ["const submittedCommand = session.inputBuffer.trim()","evaluateSequentialMissionCommand","gate.decision === \"block\"","child.stdin.write(`${submittedCommand}\\n`)","gate.message","publishMissionProgress()","observeMissionCommand"]){if(!text.includes(token)) throw new Error(`Missing mission-terminal wiring: ${token}`)}
const gate=text.indexOf("evaluateSequentialMissionCommand"); const write=text.indexOf("child.stdin.write(`${submittedCommand}\\n`)"); if(gate<0||write<gate) throw new Error("Mission gate must decide before shell execution.");
console.log("v15 mission terminal wiring regression test passed.");
