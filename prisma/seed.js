import "dotenv/config";
import { PrismaClient, MissionType } from "@prisma/client";

const prisma = new PrismaClient();

const missions = [
  {
    slug: "git-basics",
    title: "Git Basics",
    description: "Initialize a repository, create profile.html, stage it and make a meaningful commit.",
    missionType: MissionType.INDIVIDUAL,
    level: 1,
    xpReward: 100,
    estimatedMinutes: 25,
    instructions: {
      objective: "Create your first clean Git repository and commit profile.html.",
      workspace: "/workspace",
      steps: [
        "Run git init",
        "Create profile.html",
        "Stage profile.html with git add",
        "Commit it with a meaningful message",
        "Use git status and git log to review your work"
      ]
    },
    validationRules: {
      repositoryInitialized: true,
      requiredFile: "profile.html",
      fileMustBeTracked: true,
      minimumCommits: 1,
      minimumCommitMessageLength: 8
    }
  },
  {
    slug: "branching",
    title: "Branching & Merge",
    description: "Create a feature branch, commit work there and merge it safely into main.",
    missionType: MissionType.INDIVIDUAL,
    level: 2,
    xpReward: 150,
    estimatedMinutes: 35,
    instructions: {
      objective: "Practice a realistic feature-branch workflow.",
      workspace: "/workspace/branch-lab",
      steps: [
        "Enter the prepared branch-lab repository",
        "Create a branch whose name starts with feature/",
        "Create profile.html and commit it on the feature branch",
        "Switch back to main",
        "Merge the feature branch into main"
      ]
    },
    validationRules: {
      requiredBranchPrefix: "feature/",
      minimumCommitsOnMain: 2,
      mergedIntoMain: true,
      finishOnMain: true
    }
  },
  {
    slug: "remote-workflow",
    title: "Remote Workflow",
    description: "Clone a prepared remote repository, make a commit, pull safely and push the result.",
    missionType: MissionType.INDIVIDUAL,
    level: 3,
    xpReward: 170,
    estimatedMinutes: 40,
    instructions: {
      objective: "Practice clone, pull and push without using the public internet.",
      workspace: "/workspace/remote-lab",
      steps: [
        "Clone the prepared local remote repository into remote-lab",
        "Create update.txt",
        "Stage and commit the file",
        "Run git pull origin main",
        "Push your latest main branch to origin"
      ]
    },
    validationRules: {
      requiredRemote: "origin",
      requiredRemotePath: "/tmp/gitstack-origin.git",
      minimumCommits: 2,
      latestMainMustBePushed: true
    }
  },
  {
    slug: "mistake-recovery",
    title: "Mistake Recovery",
    description: "Inspect an accidental edit, restore the file and finish with a clean recovery commit.",
    missionType: MissionType.INDIVIDUAL,
    level: 4,
    xpReward: 160,
    estimatedMinutes: 30,
    instructions: {
      objective: "Learn how to inspect and safely recover from an unwanted working-tree change.",
      workspace: "/workspace/recovery-lab",
      steps: [
        "Enter recovery-lab and inspect git status / git diff",
        "Restore notes.txt to its committed version",
        "Create recovery-note.md describing what you learned",
        "Stage and commit recovery-note.md",
        "Finish with a clean working tree"
      ]
    },
    validationRules: {
      restoreAccidentalChange: true,
      requiredFile: "recovery-note.md",
      minimumCommits: 2,
      cleanWorkingTree: true
    }
  },
  {
    slug: "collaboration-basics",
    title: "Collaboration Basics",
    description: "Complete an issue-to-merge workflow with a three-person team in the controlled Gitea environment.",
    missionType: MissionType.TEAM,
    level: 5,
    xpReward: 180,
    estimatedMinutes: 60,
    instructions: {
      objective: "Work as a real team through issue, branch, Pull Request, review, tests and merge.",
      roles: ["FEATURE_DEVELOPER", "TEST_DEVELOPER", "CODE_REVIEWER"],
      workflow: ["Issue", "Branch", "Commit", "Push", "Pull Request", "Review", "Tests", "Merge"],
      note: "This mission becomes available after an instructor assigns a team and Gitea repository."
    },
    validationRules: {
      issueLinked: true,
      pullRequestRequired: true,
      reviewRequired: true,
      testsMustPassBeforeMerge: true,
      controlledConflictRequired: true
    }
  }
];

async function main() {
  for (const mission of missions) {
    await prisma.missionTemplate.upsert({
      where: { slug: mission.slug },
      update: { ...mission, isPublished: true },
      create: { ...mission, isPublished: true }
    });
  }

  console.log(`Seeded ${missions.length} GitStack mission templates.`);
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
