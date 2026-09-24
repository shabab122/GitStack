import { evaluateSequentialMissionCommand } from "../services/student/mission-terminal-policy.js";
import { mergeSandboxState } from "../services/sandbox/sandbox-store.js";

function assert(x,m){if(!x)throw new Error(m);}
const mission={slug:"origin-matrix",title:"Origin Matrix",instructions:{steps:[
  "Run git init","Create profile.html","Stage profile.html","Commit profile.html"
]}};

function make(name,{progress=0,attempt=1,status="IN_PROGRESS",assigned=false,published=false}={}){
 const runId=`run-${name}-${attempt}`;
 return mergeSandboxState(
  {sandboxId:`sb-${name}`,missionRunId:runId,running:true,containerName:`c-${name}`,workspace:"/workspace"},
  {id:`s-${name}`,sandboxId:`sb-${name}`,missionRunId:runId,userId:"student",
   mode:"ISOLATED",status:"RUNNING",
   missionRun:{id:runId,status,progressPercent:progress,attemptNumber:attempt,resetCount:0,
    assignmentId:assigned?`assignment-${name}`:null,
    missionTemplate:{...mission,published}
   }}
 );
}
function decision(state,cmd,completed){
 return evaluateSequentialMissionCommand({mission:state.mission,command:cmd,completedSteps:completed});
}
const cases=[
 ["new",{},0,"git init"],
 ["new-assigned",{assigned:true},0,"git init"],
 ["old-untouched",{},0,"git init"],
 ["published",{published:true},0,"git init"],
 ["published-assigned",{published:true,assigned:true},0,"git init"],
 ["remaining",{progress:50},2,"git add profile.html"],
];
for(const [name,opts,completed,cmd] of cases){
 const s=make(name,opts);
 assert(s.mission.slug==="origin-matrix",`${name}: mission missing`);
 const r=decision(s,cmd,completed);
 assert(r.decision==="execute-and-validate",`${name}: did not use shared engine (${r.decision})`);
}
// Completed mission remains completed when viewed; it is not silently reset.
const done=make("completed",{progress:100,status:"COMPLETED"});
assert(done.missionRunProgressPercent===100,"completed: progress lost");
assert(done.missionRunStatus==="COMPLETED","completed: status lost");
// A retry is a new run/attempt with fresh progress and Step 1.
const retry=make("retry",{progress:0,attempt:2});
assert(retry.missionRunProgressPercent===0,"retry: inherited progress");
assert(retry.missionRunAttemptNumber===2,"retry: attempt number lost");
assert(decision(retry,"git init",0).decision==="execute-and-validate","retry: did not restart at Step 1");
// Origin metadata must not alter command semantics.
for(const name of ["new","new-assigned","old-untouched","published","published-assigned"]){
 const s=make(name,{assigned:name.includes("assigned"),published:name.includes("published")});
 const wrong=decision(s,'git commit -m "skip"',0);
 assert(wrong.decision==="block",`${name}: out-of-sequence mutation escaped shared policy`);
}
console.log("Checkpoint 28 full mission-origin matrix passed.");
