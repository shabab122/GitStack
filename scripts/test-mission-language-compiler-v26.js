import { compileStep, evaluateMissionCommand } from "../services/student/mission-step-engine.js";

function assert(x,m){if(!x)throw new Error(m);}
function mission(slug, workspace, steps, validationRules={}){
  return {slug,instructions:{workspace,steps},validationRules};
}
function expect(m, index, cmd, decision="execute-and-validate"){
  const r=evaluateMissionCommand({mission:m,command:cmd,completedSteps:index});
  if(r.decision!==decision){
    throw new Error(`${m.slug} step ${index+1}: ${cmd} -> ${r.decision}/${r.code}; expected ${decision}; rule=${JSON.stringify(r.rule)}`);
  }
  return r;
}

const branching=mission("branching","/workspace/branch-lab",[
  "Enter the prepared branch-lab repository",
  "Create a branch whose name starts with feature/",
  "Create profile.html and commit it on the feature branch",
  "Switch back to main",
  "Merge the feature branch into main",
  "Verify the final repository history"
],{requiredBranchPrefix:"feature/"});

const first=compileStep(branching.instructions.steps[0],0,branching);
assert(first.dir==="branch-lab",`directory parser extracted ${first.dir}`);
expect(branching,0,"cd branch-lab");
expect(branching,0,"cd prepared","block");
expect(branching,1,"git switch -c feature/login");
expect(branching,2,"touch profile.html");
expect(branching,2,"git add profile.html");
expect(branching,2,'git commit -m "Add profile"');
expect(branching,3,"git switch main");
expect(branching,3,"git switch develop","block");
expect(branching,4,"git merge feature/login");
expect(branching,5,"git log --oneline --graph --all");

const remote=mission("remote-workflow","/workspace/remote-lab",[
  "Clone the prepared local remote repository into remote-lab",
  "Create update.txt",
  "Stage and commit the file",
  "Run git pull origin main",
  "Push your latest main branch to origin"
]);
expect(remote,0,"git clone /tmp/gitstack-origin.git remote-lab");
expect(remote,1,"touch update.txt");
expect(remote,2,"git add update.txt");
expect(remote,2,'git commit -m "Update"');
expect(remote,3,"git pull origin main");
expect(remote,4,"git push origin main");

const recovery=mission("mistake-recovery","/workspace/recovery-lab",[
  "Enter recovery-lab and inspect git status / git diff",
  "Restore notes.txt to its committed version",
  "Create recovery-note.md describing what you learned",
  "Stage and commit recovery-note.md",
  "Finish with a clean working tree"
]);
expect(recovery,0,"cd recovery-lab");
expect(recovery,0,"git status");
expect(recovery,0,"git diff");
expect(recovery,1,"git restore notes.txt");
expect(recovery,2,"touch recovery-note.md");
expect(recovery,3,"git add recovery-note.md");
expect(recovery,3,'git commit -m "Recovery note"');
expect(recovery,4,"git status");

const descriptive=mission("custom-project","/workspace/project-lab",[
  "Open the prepared project-lab workspace",
  "Fetch the latest updates from origin",
  "Rebase your feature branch onto main",
  "Stash your uncommitted changes",
  "Create tag v1.0"
]);
expect(descriptive,0,"cd project-lab");
expect(descriptive,1,"git fetch origin");
expect(descriptive,2,"git rebase main");
expect(descriptive,3,"git stash");
expect(descriptive,4,"git tag v1.0");

// Correct commands should be accepted; unrelated state-changing commands are
// still blocked rather than allowing the mission sequence to be skipped.
const wrong=evaluateMissionCommand({mission:branching,command:'git commit -m "skip"',completedSteps:0});
assert(wrong.decision==="block","unrelated mutation should remain blocked");

console.log("v26 mission-language compiler regression test passed.");
