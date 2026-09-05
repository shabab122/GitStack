import { runTrustedMissionScript } from "./sandbox-exec.js";

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

export async function prepareMissionWorkspace(sandboxId, missionSlug) {
  const script = SETUPS[missionSlug];
  if (!script) return { prepared: false, missionSlug };
  await runTrustedMissionScript(sandboxId, script, { timeoutMs: 12000 });
  return { prepared: true, missionSlug };
}
