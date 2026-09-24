import path from "node:path";
import { catalogGitSubcommand, GIT_MISSION_ACTIONS, isReadOnlyGitKind } from "./git-command-catalog.js";

const READ_ONLY = new Set([
  "pwd","ls","cat","status","diff","log","show","branch-list","tag-list","remote-list","config-read","worktree-list",
  "grep","blame","reflog","shortlog","describe","rev-parse","rev-list","ls-files","ls-remote","for-each-ref","show-branch",
  "verify-commit","verify-tag","whatchanged"
]);

function norm(v){ return String(v||"").trim().replace(/\s+/g," "); }
function stepsOf(mission){
  const c=[mission?.stepRules,mission?.instructions?.stepRules,mission?.steps,mission?.tasks,mission?.requirements,mission?.instructions?.steps,mission?.checkpoints];
  for(const v of c) if(Array.isArray(v)&&v.length) return v;
  return [];
}
function textOf(step){
  if(typeof step==="string") return step;
  return [step?.title,step?.name,step?.text,step?.description,step?.instruction,step?.label,step?.requirement].filter(Boolean).join(" ");
}
function fileOf(text){ return String(text||"").match(/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:md|txt|html|css|js|json|py|sh|yml|yaml|ts|tsx|jsx)/i)?.[0]||""; }
function dirOf(text, mission=null){
  const raw=String(text||"");
  const lower=raw.toLowerCase();
  const workspace=String(mission?.instructions?.workspace||"").trim().replace(/\/+$/,"");
  const workspaceBase=workspace && workspace!=="/workspace" ? path.posix.basename(workspace) : "";

  // If a step is clearly asking the learner to enter/open/work inside a
  // repository/workspace, the configured mission workspace is authoritative.
  // This avoids interpreting adjectives such as "prepared" or "existing" as
  // directory names ("Enter the prepared branch-lab repository").
  const navigationIntent=/\b(?:enter|open|work\s+(?:in|inside)|go\s+to|navigate\s+to|change\s+(?:into|to)|move\s+(?:into|to)|cd\s+(?:into|to)?)\b/i.test(raw);
  if(navigationIntent && workspaceBase && lower.includes(workspaceBase.toLowerCase())){
    return workspaceBase;
  }

  // Prefer path-like / distinctive repository names over ordinary prose.
  const explicitPath=raw.match(/(?:\/workspace\/)?([A-Za-z0-9._-]+(?:-[A-Za-z0-9._-]+)+(?:\/[A-Za-z0-9._-]+)*)/);
  if(navigationIntent && explicitPath) return explicitPath[0].replace(/^\/workspace\//,"").replace(/[.,;:]$/g,"");

  const afterIntent=raw.match(/\b(?:enter|open|work\s+(?:in|inside)|go\s+to|navigate\s+to|change\s+(?:into|to)|move\s+(?:into|to))\s+(?:the\s+)?(.+?)(?:\s+(?:repository|repo|workspace|directory|folder)\b|$)/i)?.[1]||"";
  if(afterIntent){
    const words=afterIntent.trim().split(/\s+/).filter(Boolean);
    const stop=new Set(["prepared","existing","assigned","current","local","remote","project","git","new","target","working"]);
    const candidate=[...words].reverse().find(w=>!stop.has(w.toLowerCase()));
    if(candidate) return candidate.replace(/[.,;:]$/g,"").replace(/^\/workspace\//,"");
  }

  // As a final safe fallback, use the configured sub-workspace only for a
  // navigation step. Never infer a directory from unrelated prose.
  if(navigationIntent && workspaceBase) return workspaceBase;
  return "";
}
function branchConstraint(text){
  const exact=String(text||"").match(/\b(?:branch\s+)?((?:feature|recovery|bugfix|hotfix)\/[A-Za-z0-9._/-]+)/i)?.[1];
  if(exact) return {exact};
  const prefix=String(text||"").match(/\b((?:feature|recovery|bugfix|hotfix)\/)(?:\*|<[^>]+>)?/i)?.[1];
  return prefix?{prefix}:null;
}

export function branchRequirementSatisfied({ current = "", branches = [], rule = null } = {}) {
  const candidates = [...new Set([...(Array.isArray(branches) ? branches : []), current].map(v => String(v||"").trim()).filter(Boolean))];
  if (rule?.exact) return candidates.includes(String(rule.exact));
  if (rule?.prefix) return candidates.some((branch) => branch.startsWith(String(rule.prefix)));
  return candidates.some((branch) => !["main", "master"].includes(branch));
}

export function classifyCommand(command){
  const c=norm(command); let m;
  if(/^pwd$/.test(c)) return {kind:"pwd",readOnly:true};
  if(/^ls(?:\s|$)/.test(c)) return {kind:"ls",readOnly:true};
  if((m=c.match(/^cd\s+(.+)$/))) return {kind:"cd",target:m[1].replace(/^['"]|['"]$/g,"")};
  if(/^cat\s+/.test(c)) return {kind:"cat",readOnly:true};
  if(/^git\s+status(?:\s|$)/.test(c)) return {kind:"status",readOnly:true};
  if(/^git\s+diff(?:\s|$)/.test(c)) return {kind:"diff",readOnly:true};
  if(/^git\s+(?:log|show)(?:\s|$)/.test(c)) return {kind:/^git\s+show/.test(c)?"show":"log",readOnly:true};
  if((m=c.match(/^git\s+clone(?:\s+--?[A-Za-z0-9-]+(?:[= ]\S+)?)*\s+([^\s]+)(?:\s+([^\s]+))?$/))) {
    return {kind:"clone",source:m[1],destination:m[2]||""};
  }
  if((m=c.match(/^git\s+(?:switch\s+(?:-c|-C)|checkout\s+(?:-b|-B))\s+([^\s]+)$/))) return {kind:"branch-create",branch:m[1]};
  if((m=c.match(/^git\s+branch\s+(?:-d|-D|--delete)\s+([^\s]+)$/))) return {kind:"branch-delete",branch:m[1]};
  if((m=c.match(/^git\s+branch\s+([^\s-][^\s]*)$/))) return {kind:"branch-create",branch:m[1]};
  if((m=c.match(/^git\s+(?:switch|checkout)\s+([^\s]+)$/))) return {kind:"branch-switch",branch:m[1]};
  if((m=c.match(/^git\s+restore(?:\s+--source=\S+)?(?:\s+--)?\s+(.+)$/))) return {kind:"restore",file:m[1].trim()};
  if((m=c.match(/^git\s+checkout\s+\S+\s+--\s+(.+)$/))) return {kind:"restore",file:m[1].trim()};
  if((m=c.match(/^git\s+add\s+(.+)$/))) return {kind:"add",file:m[1].trim()};
  if(/^git\s+commit(?:\s|$)/.test(c)) return {kind:"commit"};
  if((m=c.match(/^git\s+merge(?:\s+--no-ff)?\s+([^\s]+)$/))) return {kind:"merge",branch:m[1]};
  if((m=c.match(/^git\s+tag\s+(?:-d|--delete)\s+([^\s]+)$/))) return {kind:"tag-delete",tag:m[1]};
  if((m=c.match(/^git\s+tag\s+(?!-l\b|--list\b)([^\s-][^\s]*)/))) return {kind:"tag-create",tag:m[1]};
  if((m=c.match(/^git\s+remote\s+add\s+([^\s]+)\s+(.+)$/))) return {kind:"remote-manage",operation:"add",remote:m[1],url:m[2]};
  if((m=c.match(/^git\s+remote\s+set-url\s+([^\s]+)\s+(.+)$/))) return {kind:"remote-manage",operation:"set-url",remote:m[1],url:m[2]};
  if((m=c.match(/^git\s+remote\s+(?:remove|rm)\s+([^\s]+)$/))) return {kind:"remote-manage",operation:"remove",remote:m[1]};
  if((m=c.match(/^git\s+config\s+(?!--(?:get|list|show-origin|show-scope)\b)([^\s]+)\s+(.+)$/))) return {kind:"config-write",key:m[1],value:m[2]};
  if((m=c.match(/^git\s+rm\s+(?:-r\s+)?(.+)$/))) return {kind:"rm",file:m[1].trim()};
  if((m=c.match(/^git\s+mv\s+([^\s]+)\s+([^\s]+)$/))) return {kind:"mv",from:m[1],to:m[2]};
  if((m=c.match(/^touch\s+(.+)$/))) return {kind:"file-create",file:m[1].trim()};
  if((m=c.match(/^(?:printf|echo)\b.*(?:>|>>)\s*([^\s]+)\s*$/))) return {kind:"file-create",file:m[1]};
  if((m=c.match(/^sed\s+.*\s+([^\s]+)$/))) return {kind:"file-edit",file:m[1].replace(/^['"]|['"]$/g,"")};
  if((m=c.match(/^tee(?:\s+-a)?\s+([^\s]+)$/))) return {kind:"file-edit",file:m[1].replace(/^['"]|['"]$/g,"")};
  if((m=c.match(/^cp\s+\S+\s+([^\s]+)$/))) return {kind:"file-edit",file:m[1].replace(/^['"]|['"]$/g,"")};
  if((m=c.match(/^git\s+([a-z0-9-]+)(?:\s+(.*))?$/i))){
    const kind=catalogGitSubcommand(m[1],m[2]||"");
    if(kind) return {kind,readOnly:isReadOnlyGitKind(kind),subcommand:m[1].toLowerCase(),args:m[2]||""};
    return {kind:"invalid-or-unknown-git",unknown:true,subcommand:m[1].toLowerCase()};
  }
  if(/^[A-Za-z_][A-Za-z0-9_.-]*(?:\s|$)/.test(c)) return {kind:"unknown-shell",unknown:true};
  return {kind:"unknown",unknown:true};
}

export function compileStep(step,index=0,mission=null){
  if(step && typeof step==="object" && Array.isArray(step.acceptedActions)) return {...step,index,text:textOf(step)};
  const text=textOf(step); const l=text.toLowerCase(); const file=fileOf(text); const dir=dirOf(text,mission); let branch=branchConstraint(text);
  const accepted=[];
  // Explicit commands written in a mission step are authoritative. This keeps
  // old, new, assigned and instructor-created missions compatible even when
  // their wording is terse (for example: "Run git init").
  if(/\bgit\s+init\b/i.test(text)) accepted.push("init");
  if(/\bgit\s+status\b/i.test(text)) accepted.push("status");
  if(/\bgit\s+diff\b/i.test(text)) accepted.push("diff");
  if(/\bgit\s+(?:log|show)\b/i.test(text)) accepted.push("log","show");
  if(/\bgit\s+add\b/i.test(text)) accepted.push("add");
  if(/\bgit\s+commit\b/i.test(text)) accepted.push("commit");
  if(/\bgit\s+merge\b/i.test(text)) accepted.push("merge");
  if(/\bgit\s+clone\b/i.test(text)) accepted.push("clone");
  if(/\bgit\s+pull\b/i.test(text)) accepted.push("pull");
  if(/\bgit\s+push\b/i.test(text)) accepted.push("push");
  if(/\bgit\s+fetch\b/i.test(text)) accepted.push("fetch");
  if(/\bgit\s+reset\b/i.test(text)) accepted.push("reset");
  if(/\bgit\s+rebase\b/i.test(text)) accepted.push("rebase");
  if(/\bgit\s+cherry-pick\b/i.test(text)) accepted.push("cherry-pick");
  if(/\bgit\s+revert\b/i.test(text)) accepted.push("revert");
  if(/\bgit\s+stash\b/i.test(text)) accepted.push("stash");
  if(/\bgit\s+tag\b/i.test(text)) accepted.push("tag-create");
  if(/\bgit\s+remote\b/i.test(text)) accepted.push("remote-manage");
  if(/\bgit\s+config\b/i.test(text)) accepted.push("config-write");
  if(/\bgit\s+(?:restore|checkout\s+\S+\s+--)\b/i.test(text)) accepted.push("restore");
  if(/\bgit\s+(?:switch\s+-c|checkout\s+-b)\b/i.test(text)) accepted.push("branch-create");
  if(/\bgit\s+(?:switch|checkout)\b/i.test(text) && !/\bgit\s+(?:switch\s+-c|checkout\s+-b)\b/i.test(text)) accepted.push("branch-switch");
  if(/\btouch\s+\S+/i.test(text)) accepted.push("file-create");
  if(dir) accepted.push("cd");
  if(/\b(?:inspect|check|verify|review)\b/.test(l)&&/\bstatus\b/.test(l)) accepted.push("status");
  if(/\b(?:inspect|check|verify|review)\b/.test(l)&&/\bdiff\b/.test(l)) accepted.push("diff");
  if(/\b(?:history|git log|git show)\b/.test(l)) accepted.push("log","show");
  if(/\binitiali[sz]e\b/.test(l)&&/\brepositor/.test(l)) accepted.push("init");
  if(/\b(?:create|make).*(?:branch)|\bswitch.*branch|\bcheckout.*branch/.test(l)) accepted.push("branch-create","branch-switch");
  if(/\b(?:delete|remove)\b.*\bbranch\b/.test(l)) accepted.push("branch-delete");
  if(/\brestore\b|\brecover\b/.test(l)) accepted.push("restore");
  if(/\b(?:create|make)\b/.test(l)&&file) accepted.push("file-create");
  if(
    /\b(?:create|make|write|prepare)\b/.test(l) &&
    /\b(?:file|document|documentation|readme|notes?)\b/.test(l)
  ) accepted.push("file-create","file-edit");
  if(/\b(?:stage|git add)\b/.test(l) || /\badd\b.*\b(?:change|changes|file|files)\b/.test(l)) accepted.push("add");
  if(/\bcommit\b/.test(l)) accepted.push("commit");
  if(/\bmerge\b/.test(l)) accepted.push("merge");
  if(/\bmerge\b/.test(l) && /\bmain\b/.test(l)) {
    // Some instructor missions create the first commit on a feature branch, so
    // `main` does not exist yet. Allow only main-branch setup operations while
    // keeping the merge itself as the completion condition.
    accepted.push("branch-create", "branch-switch");
    branch = { exact: "main" };
  }
  if(/\bclean\b.*\bworking[ -]?tree\b/.test(l)) accepted.push("status");

  // Descriptive mission wording: translate intent into command families without
  // requiring the mission author to spell out the exact command.
  if(/\bclone\b/.test(l)) accepted.push("clone");
  if(/\bpull\b/.test(l)) accepted.push("pull");
  if(/\bpush\b/.test(l)) accepted.push("push");
  if(/\bfetch\b/.test(l)) accepted.push("fetch");
  if(/\brebase\b/.test(l)) accepted.push("rebase");
  if(/\bcherry[- ]?pick\b/.test(l)) accepted.push("cherry-pick");
  if(/\brevert\b/.test(l)) accepted.push("revert");
  if(/\breset\b/.test(l)) accepted.push("reset");
  if(/\bstash\b/.test(l)) accepted.push("stash");
  if(/\btag\b/.test(l)) accepted.push("tag-create");
  if(/\bremote\b.*\b(?:add|configure|set|change|remove)\b|\b(?:add|configure|set|change|remove)\b.*\bremote\b/.test(l)) accepted.push("remote-manage");
  if(/\bconfig(?:ure)?\b/.test(l)) accepted.push("config-write");

  // "Create <file> and commit it" is a multi-action step. Staging is an
  // unavoidable valid intermediate action even if the prose omits "git add".
  if(file && /\bcommit\b/.test(l) && /\b(?:create|make|edit|update|modify)\b/.test(l)) {
    accepted.push("file-create","file-edit","add","commit");
  }

  // Natural branch navigation such as "Switch back to main" / "Return to
  // develop" is common in older missions.
  const switchMatch=text.match(/\b(?:switch|checkout|return)(?:\s+back)?(?:\s+to)?\s+(?:the\s+)?(?:branch\s+)?([A-Za-z0-9._/-]+)/i);
  if(switchMatch){
    accepted.push("branch-switch");
    const candidate=switchMatch[1].replace(/[.,;:]$/g,"");
    if(candidate && !["a","an","the","feature","development","target","current","new","branch","repository","repo"].includes(candidate.toLowerCase())) branch={exact:candidate};
  }

  // Shared Git command ontology for existing and future instructor missions.
  for (const [action, phrases] of Object.entries(GIT_MISSION_ACTIONS)) {
    if (phrases.some((phrase) => l.includes(phrase))) accepted.push(action);
  }

  // Literal Git command names written in a step are authoritative.
  for (const match of text.matchAll(/\bgit\s+([a-z0-9-]+)/ig)) {
    const kind = catalogGitSubcommand(match[1], "");
    if (kind) accepted.push(kind);
  }

  // Compatibility for existing/instructor-authored missions whose steps describe
  // an intent rather than spelling out a literal Git command.
  const rules = mission?.validationRules && typeof mission.validationRules === "object"
    ? mission.validationRules
    : {};
  if (
    /\b(?:separate|isolated|independent)\b.*\b(?:development|feature)\b.*\bworkflow\b/.test(l) ||
    /\b(?:development|feature)\b.*\bworkflow\b.*\b(?:assigned|separate|isolated)\b/.test(l)
  ) {
    accepted.push("branch-create", "branch-switch");
  }
  if (/\b(?:implement|develop|apply|make)\b.*\b(?:required\s+)?(?:project\s+)?(?:change|changes|feature|modification|modifications)\b/.test(l)) {
    accepted.push("file-create", "file-edit");
  }
  if (/\b(?:track|review|inspect|check)\b.*\b(?:modification|modifications|change|changes|work)\b/.test(l)) {
    accepted.push("status", "diff", "add");
  }
  if (/\bmeaningful\b.*\bcommit/.test(l) || /\bcommit(?:s)?\b.*\b(?:completed|work|changes)\b/.test(l)) {
    accepted.push("add", "commit");
  }
  if (/\bprepare\b.*\b(?:team\s+)?review\b|\bintegration\b/.test(l)) {
    accepted.push("status", "diff", "log");
    if (rules.finishOnBranch) accepted.push("branch-switch", "merge");
  }

  const effectiveFile = file || String(rules.requiredFile || "").trim();

  // Instructor missions often keep the concrete filename in validationRules
  // while the visible step says only "the required project file". Bind that
  // rule back into the command contract instead of forcing an exact filename
  // to appear in the prose.
  if (effectiveFile && /\b(?:create|make|write|add)\b/.test(l) && /\b(?:file|document|documentation|project)\b/.test(l)) {
    accepted.push("file-create", "file-edit");
  }
  if (/\bcommit\b/.test(l) && (effectiveFile || /\b(?:change|changes|work|state|project)\b/.test(l))) {
    accepted.push("add", "commit");
  }

  let effectiveBranch = branch;
  if (!effectiveBranch && rules.requiredBranchPrefix) {
    effectiveBranch = { prefix: String(rules.requiredBranchPrefix) };
  }

  const workspace = String(mission?.instructions?.workspace || "").trim().replace(/\/+$/, "");
  const workspaceBase = workspace && workspace !== "/workspace" ? path.posix.basename(workspace) : "";
  const requiredRemotePath = String(rules.requiredRemotePath || "").trim();
  const cloneDestination =
    /\bclone\b/.test(l) && workspaceBase
      ? workspaceBase
      : (String(text).match(/\binto\s+([A-Za-z0-9._/-]+)/i)?.[1] || "");

  return {
    index,
    text,
    file: effectiveFile,
    fileExplicit: Boolean(file),
    dir,
    branch: effectiveBranch,
    remotePath: requiredRemotePath,
    cloneDestination,
    acceptedActions: [...new Set(accepted)]
  };
}

function blocked(rule, reason=""){
  const label = String(rule?.text || "Follow the active mission step").trim();
  const detail = String(reason || "").trim();
  return `[GitStack] BLOCKED: Complete Step ${rule.index + 1} first:\n${label}${detail ? `\n\n${detail}` : ""}`;
}
function sameFile(actual,expected){
  if(!expected) return true;
  const cleaned=String(actual||"").replace(/^--\s+/,"").trim();
  return cleaned==="."||cleaned==="-A"||cleaned==="--all"||cleaned.split(/\s+/).includes(expected);
}

export function evaluateMissionCommand({mission,command,completedSteps=0}){
  const all=stepsOf(mission); if(!all.length) return {decision:"execute",reason:"NO_MISSION_STEPS"};
  const index=Math.max(0,Math.min(Number(completedSteps)||0,all.length-1)); const rule=compileStep(all[index],index,mission); const cmd=classifyCommand(command);
  if(cmd.unknown) return {decision:"execute-native-error",code:"INVALID_OR_UNKNOWN",rule,command:cmd,message:""};
  if(!rule.acceptedActions.length) {
    // Do not invent a command contract. Native/read-only commands remain usable;
    // mutating commands are conservatively blocked until the mission defines an action.
    if(cmd.readOnly||READ_ONLY.has(cmd.kind)) return {decision:"execute-no-progress",code:"UNDEFINED_STEP_READ_ONLY",rule,command:cmd,message:""};
    return {decision:"block",code:"UNDEFINED_STEP_RULE",rule,command:cmd,message:blocked(rule)};
  }
  if(!rule.acceptedActions.includes(cmd.kind)){
    // Directory navigation is harmless to repository state. Let students move
    // around the sandbox even when the active step is about a different Git
    // action; it must not advance mission progress by itself.
    if(cmd.kind==="cd") return {decision:"execute-and-validate",code:"NAVIGATION",rule,command:cmd,message:""};
    if(cmd.readOnly||READ_ONLY.has(cmd.kind)) return {decision:"execute-no-progress",code:"VALID_IRRELEVANT_READ_ONLY",rule,command:cmd,message:""};
    return {decision:"block",code:"VALID_BUT_OUT_OF_SEQUENCE",rule,command:cmd,message:blocked(rule)};
  }
  if(rule.dir && cmd.kind==="cd"){
    const target=cmd.target.replace(/^\.\//,"").replace(/\/$/,""); const expected=rule.dir.replace(/^\/workspace\//,"").replace(/\/$/,"");
    if(target!==expected&&target!==`/workspace/${expected}`) return {decision:"block",code:"WRONG_DIRECTORY",rule,command:cmd,message:blocked(rule)};
  }
  if(cmd.kind==="clone"){
    const normalizePath = (value) => String(value||"").replace(/\/$/,"");
    if(rule.remotePath && normalizePath(cmd.source)!==normalizePath(rule.remotePath)) {
      return {decision:"block",code:"WRONG_REMOTE_SOURCE",rule,command:cmd,message:blocked(rule)};
    }
    if(rule.cloneDestination){
      const destination = String(cmd.destination||"").replace(/^\.\//,"").replace(/\/$/,"");
      const expectedDestination = String(rule.cloneDestination||"").replace(/^\/workspace\//,"").replace(/\/$/,"");
      if(destination!==expectedDestination && destination!==`/workspace/${expectedDestination}`) {
        return {decision:"block",code:"WRONG_CLONE_DESTINATION",rule,command:cmd,message:blocked(rule)};
      }
    }
  }
  if(rule.file && ["restore","file-create","file-edit","add","rm"].includes(cmd.kind) && !sameFile(cmd.file,rule.file)) return {decision:"block",code:"WRONG_ARGUMENT",rule,command:cmd,message:blocked(rule)};
  if(rule.branch && ["branch-create","branch-switch","branch-delete"].includes(cmd.kind)){
    const ok=rule.branch.exact?cmd.branch===rule.branch.exact:cmd.branch?.startsWith(rule.branch.prefix);
    if(!ok) return {decision:"block",code:"WRONG_ARGUMENT",rule,command:cmd,message:blocked(rule)};
  }
  return {decision:"execute-and-validate",code:"RELEVANT",rule,command:cmd};
}

export function missionSteps(mission){return stepsOf(mission);}
