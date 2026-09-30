import { compileStep } from "./mission-step-engine.js";

// The instructor form accepts prose. Compile it before publication so a
// mission cannot be offered to students when the runtime has no action for a
// step. Drafts can still be saved and revised.
export function publishedMissionContractError(mission) {
  const steps = mission?.instructions?.steps;
  if (!Array.isArray(steps) || !steps.length) return "Add at least one mission step before publishing.";
  const rules = mission?.validationRules || {};
  if (rules.fileMustBeTracked && !rules.requiredFile) {
    return "A required file must be set when 'file must be tracked' is enabled.";
  }
  if (rules.requiredFile &&
      (rules.requiredFile.startsWith("/") || rules.requiredFile.split("/").includes("..") || rules.requiredFile === ".")) {
    return "Required file must be a path inside the mission workspace.";
  }
  for (const [index, step] of steps.entries()) {
    const actions = compileStep(step, index, mission).acceptedActions;
    if (!actions.length) {
      return `Step ${index + 1} has no runnable Git action: ${step}. Describe an observable action such as git status, create a file, git add, git commit, create a branch, merge, or git log.`;
    }
    if (actions.includes("clone") && !rules.requiredRemotePath) {
      return `Step ${index + 1} asks students to clone a remote, but this mission has no configured remote repository. Use the team collaboration workflow for remote missions.`;
    }
    if ((actions.includes("pull") || actions.includes("push")) && !rules.requiredRemotePath) {
      return `Step ${index + 1} requires a remote repository. Use the team collaboration workflow for remote missions.`;
    }
  }
  return null;
}
