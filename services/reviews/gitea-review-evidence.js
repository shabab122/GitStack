import * as gitea from "../gitea/gitea-client.js";
import { ReviewError } from "./review-error.js";

const SHA = /^[a-f0-9]{40,64}$/i;
export function validReviewBranch(ref) {
  return /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/.test(ref) &&
    !ref.includes("..") && !ref.includes("//") && !ref.endsWith("/") &&
    !ref.endsWith(".") && !ref.split("/").some((part) => part.startsWith(".") || part.endsWith(".lock"));
}
export function validateReviewReference(type, ref) {
  const valid = type === "COMMIT" ? /^[a-f0-9]{7,64}$/i.test(ref)
    : type === "PULL_REQUEST" ? /^[1-9][0-9]{0,8}$/.test(ref.replace(/^#/, ""))
      : validReviewBranch(ref);
  if (!valid) throw new ReviewError("Enter a branch name, commit SHA or PR number matching the selected reference type.");
}

// Store only public evidence fields, never raw API objects, headers or credentials.
export async function captureReviewEvidence({ team, input, client = gitea }) {
  validateReviewReference(input.referenceType, input.reference);
  const owner = team.giteaOwner;
  const repo = team.giteaRepository;
  try {
    const repository = await client.getReviewRepository(owner, repo);
    if (team.giteaRepositoryId && repository.id !== team.giteaRepositoryId) {
      throw new ReviewError("The assigned repository has changed. Ask your instructor to check the team repository.", 409);
    }
    const repoUrl = new URL(`${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, `${gitea.giteaBaseUrl()}/`).href;
    let commit;
    let baseSha = null;
    let referenceUrl;
    if (input.referenceType === "PULL_REQUEST") {
      const index = input.reference.replace(/^#/, "");
      const pr = await client.getReviewPullRequest(owner, repo, index);
      if (pr.head?.repo?.id !== repository.id) throw new ReviewError("Select a Pull Request whose source branch belongs to the assigned team repository.");
      baseSha = pr.base?.sha;
      commit = await client.getReviewCommit(owner, repo, pr.head?.sha);
      referenceUrl = `${repoUrl}/pulls/${index}`;
    } else if (input.referenceType === "BRANCH") {
      const branch = await client.getReviewBranch(owner, repo, input.reference);
      const base = await client.getReviewBranch(owner, repo, repository.default_branch || "main");
      baseSha = base.commit?.id || base.commit?.sha;
      commit = await client.getReviewCommit(owner, repo, branch.commit?.id || branch.commit?.sha);
      referenceUrl = `${repoUrl}/src/branch/${input.reference.split("/").map(encodeURIComponent).join("/")}`;
    } else {
      commit = await client.getReviewCommit(owner, repo, input.reference);
      baseSha = commit.parents?.[0]?.sha || null;
      referenceUrl = `${repoUrl}/commit/${commit.sha}`;
    }
    if (!SHA.test(commit?.sha || "") || (baseSha && !SHA.test(baseSha))) throw new ReviewError("Gitea did not return a valid commit snapshot. Try again.", 502);
    if (input.referenceType !== "COMMIT" && (!baseSha || baseSha === commit.sha)) {
      throw new ReviewError("This branch or PR has no new changes against its base. Select a specific commit to review already merged work.", 409);
    }
    let commits = [commit];
    let totalCommits = 1;
    if (input.referenceType !== "COMMIT") {
      const comparison = await client.getReviewComparison(owner, repo, baseSha, commit.sha);
      commits = Array.isArray(comparison.commits) ? comparison.commits : [];
      totalCommits = comparison.total_commits ?? commits.length;
      // Refuse a partial snapshot: narrow a large branch/PR to a specific commit.
      if (totalCommits > 30 || commits.length >= 30) throw new ReviewError("This change contains too many commits for a focused review. Select a specific commit instead.", 409);
      if (!commits.some((item) => item.sha === commit.sha)) commits.push(commit);
    }
    const fileMap = new Map();
    // Compare results may omit per-commit file lists. Resolve those commits read-only.
    for (const item of commits) {
      const full = Array.isArray(item.files) ? item : await client.getReviewCommit(owner, repo, item.sha);
      for (const file of full.files || []) {
        if (typeof file.filename === "string") fileMap.set(file.filename, { filename: file.filename, status: file.status || "modified" });
      }
    }
    const selectedFiles = input.files || [];
    if (selectedFiles.some((name) => !fileMap.has(name))) throw new ReviewError("A selected file is not part of this submitted change. Check its exact path.");
    const diff = String(await client.getReviewCommitDiff(owner, repo, commit.sha) || "");
    return {
      headSha: commit.sha, baseSha,
      repositoryUrl: repoUrl, referenceUrl,
      snapshotUrl: baseSha ? `${repoUrl}/compare/${baseSha}...${commit.sha}` : `${repoUrl}/commit/${commit.sha}`,
      files: [...fileMap.values()].slice(0, 300), selectedFiles,
      filesTruncated: fileMap.size > 300,
      commits: commits.slice(0, 30).map((item) => ({ sha: item.sha, message: String(item.commit?.message || "").slice(0, 1000) })),
      totalCommits, latestCommitDiff: diff.slice(0, 60000), diffTruncated: diff.length > 60000,
      capturedAt: new Date().toISOString()
    };
  } catch (error) {
    if (error instanceof ReviewError) throw error;
    if (error.status === 404) throw new ReviewError("That branch, commit or PR was not found in your assigned repository. Push your work first and check the reference.", 400);
    throw new ReviewError("Gitea is unavailable or the repository cannot be read. Your request was not saved; retry when Gitea is ready.", 503);
  }
}
