import fs from 'node:fs';
import { evaluateMissionCommand, compileStep } from '../services/student/mission-step-engine.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const mission = {
  title: 'Collaborative Feature Development Workflow',
  instructions: {
    steps: [
      'Initialize the project repository and prepare it for development work',
      'Create a separate development workflow for the assigned feature',
      'Implement the required project changes',
      'Track and review your modifications before saving your progress',
      'Create meaningful commits that explain your completed work',
      'Prepare your changes for team review and integration'
    ]
  },
  validationRules: {
    repositoryInitialized: true,
    requiredBranchPrefix: 'feature/',
    minimumCommits: 1,
    minimumCommitMessageLength: 8,
    cleanWorkingTree: true
  }
};

for (const command of [
  'git checkout -b feature/project-update',
  'git switch -c feature/project'
]) {
  const r = evaluateMissionCommand({ mission, command, completedSteps: 1 });
  assert(r.decision === 'execute-and-validate', `${command} was incorrectly blocked: ${r.decision}/${r.code}`);
}

const wrongBranch = evaluateMissionCommand({ mission, command: 'git switch -c test', completedSteps: 1 });
assert(wrongBranch.decision === 'block', 'branch prefix requirement was not preserved');

const branchRule = compileStep(mission.instructions.steps[1], 1, mission);
assert(branchRule.acceptedActions.includes('branch-create'), 'legacy prose was not compiled as branch creation');
assert(branchRule.branch?.prefix === 'feature/', 'mission-level branch prefix was not applied');

const projectRule = compileStep(mission.instructions.steps[2], 2, mission);
assert(projectRule.acceptedActions.includes('file-create') || projectRule.acceptedActions.includes('file-edit'), 'project-change prose has no compatible file action');

const terminal = fs.readFileSync('services/sandbox/terminal-manager.js', 'utf8');
assert(terminal.includes('commandHistory: []'), 'mission terminal command history storage missing');
assert(terminal.includes('data === "\\u001b[A"'), 'ArrowUp command-history handling missing');
assert(terminal.includes('data === "\\u001b[B"'), 'ArrowDown command-history handling missing');
assert(terminal.includes('TERM=xterm-256color'), 'terminal capability setting not updated');

const studentMission = fs.readFileSync('public/student-mission.js', 'utf8');
assert(studentMission.includes('event.key === "ArrowUp"'), 'command-bar ArrowUp history missing');
assert(studentMission.includes('event.key === "ArrowDown"'), 'command-bar ArrowDown history missing');

const route = fs.readFileSync('routes/student-routes.js', 'utf8');
assert(route.includes('missionRuns: {'), 'assignment dashboard does not inspect mission runs');
assert(route.includes('status: "COMPLETED"'), 'completed assignment-run filter missing');
assert(route.includes('studentStatus: completedRun ? "COMPLETED"'), 'student assignment completion state missing');

const dashboard = fs.readFileSync('public/student-dashboard.js', 'utf8');
assert(dashboard.includes('assignment.completed'), 'dashboard does not consume assignment completion state');
assert(dashboard.includes('status-chip completed') && dashboard.includes('COMPLETED'), 'dashboard completed assignment label missing');

console.log('v24 final runtime bugfix regression test passed.');
