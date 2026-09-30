import assert from 'node:assert/strict';
import { evaluateMissionCommand } from '../services/student/mission-step-engine.js';

const mission={steps:['Run git init','Create profile.html','Stage profile.html with git add','Commit it with a meaningful message','Use git status and git log to review your work']};
let r=evaluateMissionCommand({mission,command:'git init',completedSteps:0});
assert.equal(r.decision,'execute-and-validate');
r=evaluateMissionCommand({mission,command:'git status',completedSteps:1});
assert.equal(r.decision,'execute-no-progress'); assert.equal(r.message,'');
r=evaluateMissionCommand({mission,command:'hgeg',completedSteps:1});
assert.equal(r.decision,'execute-native-error'); assert.equal(r.message,'');
r=evaluateMissionCommand({mission,command:'git add profile.html',completedSteps:1});
assert.equal(r.decision,'block'); assert.match(r.message,/^\[GitStack\] BLOCKED: Complete Step 2 first:/); assert.ok(!r.message.includes('Expected next action'));
r=evaluateMissionCommand({mission,command:'touch profile.html',completedSteps:1});
assert.equal(r.decision,'execute-and-validate');
console.log('v17 feedback policy: PASS');
