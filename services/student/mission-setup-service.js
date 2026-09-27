import { runTrustedMissionScript } from "./sandbox-exec.js";
import { compileStep } from "./mission-step-engine.js";

const SETUPS = Object.freeze({
  "git-basics": `
    cd /workspace
    rm -rf .git profile.html
  `,
  branching: `
    cd /workspace
    rm -rf branch-lab
    mkdir -p branch-lab
    cd branch-lab
    git init -b main >/dev/null
    printf '%s\n' '# GitStack Branch Lab' > README.md
    git add README.md
    git commit -m 'Starter commit' >/dev/null
  `,
  "remote-workflow": `
    rm -rf /tmp/gitstack-origin.git /tmp/gitstack-seed /workspace/remote-lab
    git init --bare /tmp/gitstack-origin.git >/dev/null
    mkdir -p /tmp/gitstack-seed
    cd /tmp/gitstack-seed
    git init -b main >/dev/null
    printf '%s\n' '# GitStack Remote Lab' > README.md
    git add README.md
    git commit -m 'Initial remote commit' >/dev/null
    git remote add origin /tmp/gitstack-origin.git
    git push -u origin main >/dev/null
    git --git-dir=/tmp/gitstack-origin.git symbolic-ref HEAD refs/heads/main
    cd /workspace
    rm -rf /tmp/gitstack-seed
  `,
  "mistake-recovery": `
    cd /workspace
    rm -rf recovery-lab
    mkdir -p recovery-lab
    cd recovery-lab
    git init -b main >/dev/null
    printf '%s\n' 'This line is correct.' > notes.txt
    git add notes.txt
    git commit -m 'Add clean notes' >/dev/null
    printf '%s\n' 'ACCIDENTAL CHANGE - RESTORE ME' >> notes.txt
  `
});

function needsStudentInitialization(mission) {
  const first = mission?.instructions?.steps?.[0];
  if (!first) return false;
  const actions = compileStep(first, 0, mission).acceptedActions;
  return actions.includes("init") || actions.includes("clone");
}

export function publishedMissionStarterScript(mission) {
  // An initialize/clone objective must begin with no repository. Other Git
  // objectives need a real main branch before the student starts typing.
  if (needsStudentInitialization(mission)) return `
    cd /workspace
    if [ -f .bash_history ] && ! git ls-files --error-unmatch .bash_history >/dev/null 2>&1; then
      rm -f .bash_history
    fi
  `;
  const first = String(mission?.instructions?.steps?.[0] || "");
  const pendingChange = /\b(?:pending|uncommitted|damaged|accidental)\b/i.test(first);
  return `
    cd /workspace
    if [ ! -d .git ]; then
      git init -b main >/dev/null
      printf '%s\\n' '.bash_history' > .gitignore
      git add .gitignore
      git commit -m 'Initialize mission workspace' >/dev/null
      ${pendingChange ? "printf '%s\\n' 'Review this pending change.' > starter-change.txt" : ""}
    fi
    if [ -f .bash_history ] && ! git ls-files --error-unmatch .bash_history >/dev/null 2>&1; then
      rm -f .bash_history
    fi
  `;
}

export async function prepareMissionWorkspace(sandboxId, missionSlug, mission = null) {
  const script = SETUPS[missionSlug];

  // Dynamic instructor-created missions do not have a hardcoded slug entry.
  // Derive the starting repository state from the actual first objective.
  const fallbackScript = publishedMissionStarterScript(mission);

  await runTrustedMissionScript(
    sandboxId,
    script || fallbackScript,
    { timeoutMs: 12000 }
  );

  return { prepared: true, missionSlug, dynamicFallback: !script };
}


export async function ensureMissionWorkspace(
  sandboxId,
  missionSlug,
  { progressPercent = 0, mission = null } = {}
) {
  const progress = Math.max(0, Math.min(100, Number(progressPercent || 0)));

  // Environment dependencies are safe to restore without touching student work.
  if (missionSlug === "remote-workflow") {
    const script = `
      if [ ! -d /tmp/gitstack-origin.git ]; then
        rm -rf /tmp/gitstack-seed
        git init --bare /tmp/gitstack-origin.git >/dev/null
        mkdir -p /tmp/gitstack-seed
        cd /tmp/gitstack-seed
        git init -b main >/dev/null
        printf '%s\n' '# GitStack Remote Lab' > README.md
        git add README.md
        git commit -m 'Initial remote commit' >/dev/null
        git remote add origin /tmp/gitstack-origin.git
        git push -u origin main >/dev/null
        git --git-dir=/tmp/gitstack-origin.git symbolic-ref HEAD refs/heads/main
        rm -rf /tmp/gitstack-seed
      fi
    `;
    await runTrustedMissionScript(sandboxId, script, { timeoutMs: 12000 });
    return { prepared: true, ensured: true, missionSlug };
  }

  // For untouched attempts, recover missing starter workspaces. Never recreate
  // these repositories after progress has begun because that would overwrite
  // learner state.
  if (progress <= 0 && missionSlug === "branching") {
    const script = `
      if [ ! -d /workspace/branch-lab/.git ]; then
        rm -rf /workspace/branch-lab
        mkdir -p /workspace/branch-lab
        cd /workspace/branch-lab
        git init -b main >/dev/null
        printf '%s\n' '# GitStack Branch Lab' > README.md
        git add README.md
        git commit -m 'Starter commit' >/dev/null
      fi
    `;
    await runTrustedMissionScript(sandboxId, script, { timeoutMs: 12000 });
    return { prepared: true, ensured: true, missionSlug };
  }

  if (progress <= 0 && missionSlug === "mistake-recovery") {
    const script = `
      if [ ! -d /workspace/recovery-lab/.git ]; then
        rm -rf /workspace/recovery-lab
        mkdir -p /workspace/recovery-lab
        cd /workspace/recovery-lab
        git init -b main >/dev/null
        printf '%s\n' 'This line is correct.' > notes.txt
        git add notes.txt
        git commit -m 'Add clean notes' >/dev/null
        printf '%s\n' 'ACCIDENTAL CHANGE - RESTORE ME' >> notes.txt
      fi
    `;
    await runTrustedMissionScript(sandboxId, script, { timeoutMs: 12000 });
    return { prepared: true, ensured: true, missionSlug };
  }

  // Instructor-created published missions use dynamic slugs. If no
  // predefined recovery rule exists, guarantee a usable Git workspace.
  if (progress <= 0 && !SETUPS[missionSlug]) {
    await runTrustedMissionScript(sandboxId, publishedMissionStarterScript(mission), { timeoutMs: 12000 });
    return { prepared: true, ensured: true, missionSlug, dynamicFallback: true };
  }

  return { prepared: false, ensured: false, missionSlug };
}
