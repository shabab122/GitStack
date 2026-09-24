import { evaluateMissionCommand } from "../services/student/mission-step-engine.js";
function mission(step){return {instructions:{steps:[step]}}}
function expect(step,cmd,decision,code){const r=evaluateMissionCommand({mission:mission(step),command:cmd,completedSteps:0}); if(r.decision!==decision||(code&&r.code!==code)) throw new Error(`${cmd}: expected ${decision}/${code||'*'} got ${r.decision}/${r.code}`);}
// invalid/unknown -> real shell + guidance
expect("Create feature/login branch","git swtich main","execute-native-error","INVALID_OR_UNKNOWN");
// valid informational but irrelevant -> execute, no progress
expect("Create feature/login branch","git status","execute-no-progress","VALID_IRRELEVANT_READ_ONLY");
// valid mutating future/wrong action -> pre-execution block
expect("Create feature/login branch","git commit -m x","block","VALID_BUT_OUT_OF_SEQUENCE");
// wrong args
expect("Create feature/login branch","git switch -c test","block","WRONG_ARGUMENT");
// correct alternative branch syntax
expect("Create feature/login branch","git checkout -b feature/login","execute-and-validate","RELEVANT");
expect("Create feature/login branch","git switch -c feature/login","execute-and-validate","RELEVANT");
// wrong/correct directory
expect("Enter recovery-lab and inspect git status / git diff","cd wrong","block","WRONG_DIRECTORY");
expect("Enter recovery-lab and inspect git status / git diff","cd recovery-lab","execute-and-validate","RELEVANT");
// wrong file vs correct file
expect("Restore notes.txt to its committed version","git restore other.txt","block","WRONG_ARGUMENT");
expect("Restore notes.txt to its committed version","git restore notes.txt","execute-and-validate","RELEVANT");
// multi-action step allows each constituent action but progress remains state-driven
expect("Stage and commit recovery-note.md","git add recovery-note.md","execute-and-validate","RELEVANT");
expect("Stage and commit recovery-note.md","git commit -m recovery","execute-and-validate","RELEVANT");
// later mutating action blocked
expect("Inspect git status","git push","block","VALID_BUT_OUT_OF_SEQUENCE");
console.log("v15 mission command matrix passed.");
