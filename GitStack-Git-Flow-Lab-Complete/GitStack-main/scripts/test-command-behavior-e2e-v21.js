import { evaluateMissionCommand } from "../services/student/mission-step-engine.js";
import { evaluateSequentialMissionCommand } from "../services/student/mission-terminal-policy.js";

function assert(x,m){if(!x)throw new Error(m);}
function one(step,cmd){
  return evaluateMissionCommand({mission:{instructions:{steps:[step]}},command:cmd,completedSteps:0});
}
function expect(step,cmd,decision,code){
  const r=one(step,cmd);
  assert(r.decision===decision,`${cmd}: expected ${decision}, got ${r.decision}`);
  if(code) assert(r.code===code,`${cmd}: expected ${code}, got ${r.code}`);
  return r;
}

// Full command-behavior policy matrix.
expect("Create feature/login branch","git swtich main","execute-native-error","INVALID_OR_UNKNOWN");
expect("Create feature/login branch","git status","execute-no-progress","VALID_IRRELEVANT_READ_ONLY");
expect("Create feature/login branch","git commit -m x","block","VALID_BUT_OUT_OF_SEQUENCE");
expect("Create feature/login branch","git switch -c test","block","WRONG_ARGUMENT");
expect("Create feature/login branch","git checkout -b feature/login","execute-and-validate","RELEVANT");
expect("Create feature/login branch","git switch -c feature/login","execute-and-validate","RELEVANT");
expect("Enter recovery-lab and inspect git status / git diff","cd wrong","block","WRONG_DIRECTORY");
expect("Enter recovery-lab and inspect git status / git diff","cd recovery-lab","execute-and-validate","RELEVANT");
expect("Restore notes.txt to its committed version","git restore other.txt","block","WRONG_ARGUMENT");
expect("Restore notes.txt to its committed version","git restore notes.txt","execute-and-validate","RELEVANT");
expect("Stage and commit recovery-note.md","git add recovery-note.md","execute-and-validate","RELEVANT");
expect("Stage and commit recovery-note.md","git commit -m recovery","execute-and-validate","RELEVANT");
expect("Inspect git status","git push","block","VALID_BUT_OUT_OF_SEQUENCE");

// File creation and argument targeting.
expect("Create profile.html","touch other.html","block","WRONG_ARGUMENT");
expect("Create profile.html","touch profile.html","execute-and-validate","RELEVANT");
expect("Stage profile.html","git add README.md","block","WRONG_ARGUMENT");
expect("Stage profile.html","git add profile.html","execute-and-validate","RELEVANT");

// Feedback contract: concise, current-step only, no exact next-command hints,
// no implementation wording.
const b=expect("Create profile.html",'git commit -m "early"',"block","VALID_BUT_OUT_OF_SEQUENCE");
assert(/\[GitStack\] BLOCKED/i.test(b.message||""),"missing GitStack blocker");
assert(/Step 1/i.test(b.message||""),"blocker missing active step");
assert(/Create profile\.html/i.test(b.message||""),"blocker missing active requirement");
assert(!/Expected next action/i.test(b.message||""),"exact-command hint leaked");
assert(!/\bLinux\b|\bUbuntu\b/i.test(b.message||""),"implementation wording leaked");

// Sequential wrapper must preserve the same decision.
const wrapped=evaluateSequentialMissionCommand({
  mission:{instructions:{steps:["Create profile.html","Stage profile.html"]}},
  command:'git commit -m "early"',completedSteps:0
});
assert(wrapped.decision==="block","sequential wrapper failed to preserve block");

console.log("Checkpoint 29 full command-behavior E2E policy matrix passed.");
