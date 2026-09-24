import fs from "node:fs";
const text=fs.readFileSync(new URL("../services/sandbox/terminal-manager.js",import.meta.url),"utf8");
for(const token of ["const missionPrompt = () =>","const sendMissionPrompt = () =>","const sendMissionGuidanceAndPrompt = (message) =>","sendMissionGuidanceAndPrompt(gate.message)","sendMissionPrompt();"]){
 if(!text.includes(token)) throw new Error(`Missing prompt-restoration wiring: ${token}`);
}
if(!text.includes('return `student@gitstack:${cwd}$ `')) throw new Error('Blocked commands must restore the visible shell prompt.');
if(text.includes('setTimeout(() => sendMissionGuidanceAndPrompt(gate.message), 140)')) throw new Error('Native/read-only commands must not receive injected GitStack guidance/prompt.');
console.log('v17 prompt/feedback regression test passed.');
