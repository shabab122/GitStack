import express from "express";
import argon2 from "argon2";
import { z } from "zod";
import { TeamRole, UserRole } from "@prisma/client";

import {
  decryptPublicUser,
  decryptUserValue,
  encryptUserValue
} from "../services/security/user-data-crypto.js";
import {
  createSandbox,
  deleteSandbox,
  resetSandbox,
  startSandbox
} from "../services/sandbox/sandbox-service.js";
import { prepareMissionWorkspace } from "../services/student/mission-setup-service.js";
import { validateMission } from "../services/student/mission-validator-service.js";
import { buildStudentLeaderboards } from "../services/leaderboard/leaderboard-service.js";

const runIdSchema = z.string().uuid();
const missionSlugSchema = z.string().trim().min(2).max(100);
const teamRoleSchema = z.nativeEnum(TeamRole);
const studentTeamSchema = z.object({
  name: z.string().trim().min(2).max(80),
  members: z.array(z.object({
    userId: z.string().uuid(),
    teamRole: teamRoleSchema
  })).length(3)
});
const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  department: z.string().trim().min(2).max(100),
  semester: z.string().trim().min(1).max(100)
});
const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[a-z]/, "Password requires a lowercase letter.")
    .regex(/[A-Z]/, "Password requires an uppercase letter.")
    .regex(/[0-9]/, "Password requires a number.")
    .regex(/[^A-Za-z0-9]/, "Password requires a symbol.")
});

function requireStudent(req, res, next) {
  if (!req.user || req.user.role !== UserRole.STUDENT) {
    return res.status(403).json({ error: "Student access is required." });
  }
  next();
}

function levelFromXp(xp) {
  const safeXp = Math.max(0, Number(xp) || 0);
  const level = Math.floor(safeXp / 250) + 1;
  const levelStart = (level - 1) * 250;
  const nextLevelXp = level * 250;
  return {
    level,
    levelStartXp: levelStart,
    nextLevelXp,
    progressPercent: Math.min(100, Math.round(((safeXp - levelStart) / 250) * 100))
  };
}

function missionRunSummary(run) {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    progressPercent: run.progressPercent,
    attemptNumber: run.attemptNumber,
    submissionCount: run.submissionCount,
    resetCount: run.resetCount,
    xpAwarded: run.xpAwarded,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    expiresAt: run.expiresAt,
    updatedAt: run.updatedAt,
    mission: run.missionTemplate
      ? {
          id: run.missionTemplate.id,
          slug: run.missionTemplate.slug,
          title: run.missionTemplate.title,
          description: run.missionTemplate.description,
          level: run.missionTemplate.level,
          xpReward: run.missionTemplate.xpReward,
          estimatedMinutes: run.missionTemplate.estimatedMinutes,
          instructions: run.missionTemplate.instructions
        }
      : null,
    assessment: run.assessmentResult
      ? {
          totalScore: run.assessmentResult.totalScore,
          passed: run.assessmentResult.passed,
          ruleResults: run.assessmentResult.ruleResults,
          assessedAt: run.assessmentResult.assessedAt
        }
      : null,
    feedback: (run.feedback || []).map((item) => ({
      id: item.id,
      code: item.code,
      language: item.language,
      message: item.message,
      details: item.details,
      createdAt: item.createdAt
    })),
    sandbox: run.sandboxSessions?.[0]
      ? {
          sandboxId: run.sandboxSessions[0].sandboxId,
          status: run.sandboxSessions[0].status,
          mode: run.sandboxSessions[0].mode,
          expiresAt: run.sandboxSessions[0].expiresAt,
          containerName: run.sandboxSessions[0].containerName
        }
      : null
  };
}

function runInclude() {
  return {
    missionTemplate: true,
    assessmentResult: true,
    feedback: { orderBy: { createdAt: "desc" }, take: 6 },
    sandboxSessions: {
      where: { status: { not: "DELETED" } },
      orderBy: { createdAt: "desc" },
      take: 1
    }
  };
}

async function findOwnedRun(prisma, userId, runId) {
  return prisma.missionRun.findFirst({
    where: { id: runId, userId },
    include: runInclude()
  });
}

function leaderboardRow(row) {
  return {
    id: row.id,
    xp: row.xp,
    rank: row.rank,
    milestone: row.milestone || null,
    completedMissions: row.completedMissions,
    passedAssessments: row.passedAssessments,
    attempts: row.attempts,
    contributionScore: row.contributionScore,
    fullName: decryptUserValue(row.fullNameEncrypted),
    universityId: decryptUserValue(row.universityIdEncrypted)
  };
}

function validateStudentTeamMembers(members, currentUserId) {
  const ids = new Set(members.map((member) => member.userId));
  const roles = new Set(members.map((member) => member.teamRole));
  if (ids.size !== 3 || !ids.has(currentUserId)) {
    const error = new Error("Your self-formed team must contain you and two different students.");
    error.statusCode = 400;
    throw error;
  }
  if (roles.size !== 3) {
    const error = new Error("Assign one Feature Developer, one Test Developer and one Code Reviewer.");
    error.statusCode = 400;
    throw error;
  }
}

export function createStudentRouter({
  requireAuth,
  prisma,
  terminalManager
}) {
  const router = express.Router();
  const sandboxOptions = { prisma, terminalManager };

  router.use(requireAuth, requireStudent);

  router.get("/dashboard", async (req, res, next) => {
    try {
      const [missions, runs, teamMembership, individualAssignments] = await Promise.all([
        prisma.missionTemplate.findMany({
          where: { isPublished: true, missionType: "INDIVIDUAL" },
          orderBy: [{ level: "asc" }, { createdAt: "asc" }]
        }),
        prisma.missionRun.findMany({
          where: { userId: req.user.id },
          orderBy: { updatedAt: "desc" },
          include: runInclude(),
          take: 20
        }),
        prisma.teamMember.findFirst({
          where: { userId: req.user.id },
          include: {
            team: {
              include: {
                assignments: {
                  where: { status: "ACTIVE" },
                  include: { missionTemplate: true },
                  orderBy: { createdAt: "desc" },
                  take: 3
                }
              }
            }
          }
        }),
        prisma.assignment.findMany({
          where: { studentId: req.user.id, status: "ACTIVE" },
          include: { missionTemplate: true, createdBy: true },
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
          take: 8
        })
      ]);

      const completedSlugs = new Set(
        runs.filter((run) => run.status === "COMPLETED").map((run) => run.missionTemplate.slug)
      );
      const activeRun = runs.find((run) => run.status === "IN_PROGRESS") || null;
      const completedCount = completedSlugs.size;
      const inProgressCount = runs.filter((run) => run.status === "IN_PROGRESS").length;
      const xpLevel = levelFromXp(req.user.xp);

      res.json({
        student: decryptPublicUser(req.user),
        xp: {
          total: req.user.xp,
          ...xpLevel
        },
        statistics: {
          totalMissions: missions.length,
          completedMissions: completedCount,
          inProgressMissions: inProgressCount,
          completionPercent: missions.length
            ? Math.round((completedCount / missions.length) * 100)
            : 0
        },
        activeRun: missionRunSummary(activeRun),
        recentRuns: runs.slice(0, 5).map(missionRunSummary),
        assignments: individualAssignments.map((assignment) => ({
          id: assignment.id,
          status: assignment.status,
          startsAt: assignment.startsAt,
          dueAt: assignment.dueAt,
          mission: {
            id: assignment.missionTemplate.id,
            slug: assignment.missionTemplate.slug,
            title: assignment.missionTemplate.title,
            xpReward: assignment.missionTemplate.xpReward
          },
          assignedBy: decryptUserValue(assignment.createdBy.fullName)
        })),
        team: teamMembership
          ? {
              id: teamMembership.team.id,
              name: teamMembership.team.name,
              role: teamMembership.teamRole,
              assignments: teamMembership.team.assignments.map((assignment) => ({
                id: assignment.id,
                status: assignment.status,
                startsAt: assignment.startsAt,
                dueAt: assignment.dueAt,
                mission: {
                  slug: assignment.missionTemplate.slug,
                  title: assignment.missionTemplate.title
                }
              }))
            }
          : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/missions", async (req, res, next) => {
    try {
      const [missions, runs, assignments] = await Promise.all([
        prisma.missionTemplate.findMany({
          where: { isPublished: true },
          orderBy: [{ level: "asc" }, { createdAt: "asc" }]
        }),
        prisma.missionRun.findMany({
          where: { userId: req.user.id },
          orderBy: { updatedAt: "desc" },
          include: {
            assessmentResult: true,
            missionTemplate: { select: { slug: true } },
            sandboxSessions: {
              where: { status: { not: "DELETED" } },
              orderBy: { createdAt: "desc" },
              take: 1
            }
          }
        }),
        prisma.assignment.findMany({
          where: { studentId: req.user.id, status: "ACTIVE" },
          include: { missionTemplate: { select: { slug: true } }, createdBy: true }
        })
      ]);

      const assignmentBySlug = new Map(assignments.map((assignment) => [assignment.missionTemplate.slug, assignment]));
      const runsBySlug = new Map();
      for (const run of runs) {
        const list = runsBySlug.get(run.missionTemplate.slug) || [];
        list.push(run);
        runsBySlug.set(run.missionTemplate.slug, list);
      }

      res.json({
        missions: missions.map((mission) => {
          const missionRuns = runsBySlug.get(mission.slug) || [];
          const active = missionRuns.find((run) => run.status === "IN_PROGRESS") || null;
          const completed = missionRuns.find((run) => run.status === "COMPLETED") || null;
          const latest = active || completed || missionRuns[0] || null;
          const assignment = assignmentBySlug.get(mission.slug) || null;
          return {
            id: mission.id,
            slug: mission.slug,
            title: mission.title,
            description: mission.description,
            missionType: mission.missionType.toLowerCase(),
            level: mission.level,
            xpReward: mission.xpReward,
            estimatedMinutes: mission.estimatedMinutes,
            instructions: mission.instructions,
            status: active ? "IN_PROGRESS" : completed ? "COMPLETED" : "NOT_STARTED",
            attempts: missionRuns.length,
            latestRunId: latest?.id || null,
            latestScore: latest?.assessmentResult?.totalScore ?? null,
            sandboxId: latest?.sandboxSessions?.[0]?.sandboxId || null,
            available: mission.missionType === "INDIVIDUAL",
            assignment: assignment ? {
              id: assignment.id,
              dueAt: assignment.dueAt,
              startsAt: assignment.startsAt,
              assignedBy: decryptUserValue(assignment.createdBy.fullName)
            } : null
          };
        })
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/missions/:slug/start", async (req, res, next) => {
    try {
      const slug = missionSlugSchema.parse(req.params.slug);
      const forceNew = Boolean(req.body?.retry);
      const mission = await prisma.missionTemplate.findFirst({
        where: { slug, isPublished: true, missionType: "INDIVIDUAL" }
      });
      if (!mission) {
        return res.status(404).json({ error: "Individual mission not found." });
      }

      const assignment = await prisma.assignment.findFirst({
        where: {
          studentId: req.user.id,
          missionTemplateId: mission.id,
          status: "ACTIVE"
        },
        orderBy: { createdAt: "desc" }
      });

      if (!forceNew) {
        const existing = await prisma.missionRun.findFirst({
          where: { userId: req.user.id, missionTemplateId: mission.id, status: "IN_PROGRESS" },
          orderBy: { updatedAt: "desc" },
          include: runInclude()
        });
        if (existing) {
          const expired = existing.expiresAt && existing.expiresAt.getTime() <= Date.now();
          if (expired) {
            const oldSandbox = existing.sandboxSessions?.[0] || null;
            if (oldSandbox && !["DELETED", "EXPIRED"].includes(oldSandbox.status)) {
              await deleteSandbox(oldSandbox.sandboxId, req.user.id, sandboxOptions).catch(() => {});
            }
            await prisma.missionRun.update({
              where: { id: existing.id },
              data: { status: "TIMED_OUT", progressPercent: 0 }
            });
          } else {
            if (assignment && !existing.assignmentId) {
              await prisma.missionRun.update({
                where: { id: existing.id },
                data: { assignmentId: assignment.id }
              });
            }
            let sandbox = existing.sandboxSessions?.[0] || null;
            if (!sandbox || ["EXPIRED", "FAILED", "DELETED"].includes(sandbox.status)) {
              const created = await createSandbox(req.user.id, {
                ...sandboxOptions,
                missionRunId: existing.id,
                mode: "isolated"
              });
              await prepareMissionWorkspace(created.sandboxId, slug);
              sandbox = created;
            } else if (sandbox.status === "STOPPED") {
              sandbox = await startSandbox(sandbox.sandboxId, req.user.id, sandboxOptions);
            }

            const refreshed = await findOwnedRun(prisma, req.user.id, existing.id);
            return res.json({
              message: "Continuing your active mission.",
              run: missionRunSummary(refreshed),
              sandbox
            });
          }
        }
      }

      const attemptNumber = (await prisma.missionRun.count({
        where: { userId: req.user.id, missionTemplateId: mission.id }
      })) + 1;
      const expiresAt = new Date(
        Date.now() + Math.max(45, Number(mission.estimatedMinutes || 30) * 2) * 60 * 1000
      );

      const run = await prisma.missionRun.create({
        data: {
          missionTemplateId: mission.id,
          assignmentId: assignment?.id || null,
          userId: req.user.id,
          status: "IN_PROGRESS",
          progressPercent: 0,
          attemptNumber,
          startedAt: new Date(),
          expiresAt
        }
      });

      let createdSandbox = null;
      try {
        createdSandbox = await createSandbox(req.user.id, {
          ...sandboxOptions,
          missionRunId: run.id,
          mode: "isolated"
        });
        await prepareMissionWorkspace(createdSandbox.sandboxId, slug);
        const refreshed = await findOwnedRun(prisma, req.user.id, run.id);
        return res.status(201).json({
          message: "Mission started successfully.",
          run: missionRunSummary(refreshed),
          sandbox: createdSandbox
        });
      } catch (error) {
        if (createdSandbox?.sandboxId) {
          await deleteSandbox(
            createdSandbox.sandboxId,
            req.user.id,
            sandboxOptions
          ).catch(() => {});
        }
        await prisma.missionRun.update({
          where: { id: run.id },
          data: { status: "FAILED" }
        }).catch(() => {});
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.get("/mission-runs/:id", async (req, res, next) => {
    try {
      const runId = runIdSchema.parse(req.params.id);
      const run = await findOwnedRun(prisma, req.user.id, runId);
      if (!run) return res.status(404).json({ error: "Mission run not found." });
      res.json({ run: missionRunSummary(run) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/mission-runs/:id/reset", async (req, res, next) => {
    try {
      const runId = runIdSchema.parse(req.params.id);
      const run = await findOwnedRun(prisma, req.user.id, runId);
      if (!run) return res.status(404).json({ error: "Mission run not found." });
      if (run.status === "COMPLETED") {
        return res.status(409).json({ error: "Completed attempts cannot be reset. Start a practice retry instead." });
      }
      if (run.expiresAt && run.expiresAt.getTime() <= Date.now()) {
        const expiredSandbox = run.sandboxSessions?.[0];
        if (expiredSandbox && !["DELETED", "EXPIRED"].includes(expiredSandbox.status)) {
          await deleteSandbox(expiredSandbox.sandboxId, req.user.id, sandboxOptions).catch(() => {});
        }
        await prisma.missionRun.update({
          where: { id: run.id },
          data: { status: "TIMED_OUT", progressPercent: 0 }
        });
        return res.status(409).json({ error: "This mission attempt has timed out. Start a new attempt." });
      }

      const activeSandbox = run.sandboxSessions?.[0];
      let sandbox;
      if (activeSandbox && !["DELETED", "EXPIRED", "FAILED"].includes(activeSandbox.status)) {
        sandbox = await resetSandbox(activeSandbox.sandboxId, req.user.id, sandboxOptions);
      } else {
        sandbox = await createSandbox(req.user.id, {
          ...sandboxOptions,
          missionRunId: run.id,
          mode: "isolated"
        });
      }
      await prepareMissionWorkspace(sandbox.sandboxId, run.missionTemplate.slug);
      await prisma.missionRun.update({
        where: { id: run.id },
        data: {
          status: "IN_PROGRESS",
          progressPercent: 0,
          resetCount: { increment: 1 }
        }
      });
      const refreshed = await findOwnedRun(prisma, req.user.id, run.id);
      res.json({ message: "Mission workspace reset successfully.", run: missionRunSummary(refreshed), sandbox });
    } catch (error) {
      next(error);
    }
  });

  router.post("/mission-runs/:id/submit", async (req, res, next) => {
    try {
      const runId = runIdSchema.parse(req.params.id);
      const run = await findOwnedRun(prisma, req.user.id, runId);
      if (!run) return res.status(404).json({ error: "Mission run not found." });

      if (run.status === "COMPLETED" && run.assessmentResult?.passed) {
        return res.json({
          message: "This mission attempt is already completed.",
          run: missionRunSummary(run),
          xp: req.user.xp
        });
      }
      if (run.expiresAt && run.expiresAt.getTime() <= Date.now()) {
        const expiredSandbox = run.sandboxSessions?.[0];
        if (expiredSandbox && !["DELETED", "EXPIRED"].includes(expiredSandbox.status)) {
          await deleteSandbox(expiredSandbox.sandboxId, req.user.id, sandboxOptions).catch(() => {});
        }
        await prisma.missionRun.update({
          where: { id: run.id },
          data: { status: "TIMED_OUT", progressPercent: 0, lastSubmittedAt: new Date() }
        });
        return res.status(409).json({ error: "Mission time expired. Start a new attempt and try again." });
      }

      const sandbox = run.sandboxSessions?.[0];
      if (!sandbox || ["DELETED", "EXPIRED", "FAILED"].includes(sandbox.status)) {
        return res.status(409).json({ error: "A working sandbox is required before submitting this mission." });
      }
      if (sandbox.status === "STOPPED") {
        await startSandbox(sandbox.sandboxId, req.user.id, sandboxOptions);
      }

      const validation = await validateMission({
        sandboxId: sandbox.sandboxId,
        missionSlug: run.missionTemplate.slug,
        mission: run.missionTemplate
      });
      const now = new Date();

      const previousReward = await prisma.missionRun.findFirst({
        where: {
          userId: req.user.id,
          missionTemplateId: run.missionTemplateId,
          status: "COMPLETED",
          xpAwarded: { gt: 0 },
          id: { not: run.id }
        },
        select: { id: true }
      });
      const xpToAward = validation.passed && !previousReward
        ? run.missionTemplate.xpReward
        : 0;

      const feedbackRows = validation.feedback.map((message, index) => ({
        missionRunId: run.id,
        userId: req.user.id,
        code: validation.passed ? "MISSION_COMPLETED" : `MISSION_HINT_${index + 1}`,
        language: "bn",
        message,
        details: {
          score: validation.score,
          failedChecks: validation.checks.filter((item) => !item.passed).map((item) => item.code)
        }
      }));

      await prisma.$transaction(async (tx) => {
        await tx.assessmentResult.upsert({
          where: { missionRunId: run.id },
          update: {
            totalScore: validation.score,
            individualScore: validation.score,
            passed: validation.passed,
            ruleResults: validation.checks,
            assessedAt: now
          },
          create: {
            missionRunId: run.id,
            totalScore: validation.score,
            individualScore: validation.score,
            passed: validation.passed,
            ruleResults: validation.checks,
            assessedAt: now
          }
        });

        await tx.feedback.deleteMany({
          where: { missionRunId: run.id, code: { startsWith: "MISSION_" } }
        });
        if (feedbackRows.length) await tx.feedback.createMany({ data: feedbackRows });

        await tx.missionRun.update({
          where: { id: run.id },
          data: {
            status: validation.passed ? "COMPLETED" : "IN_PROGRESS",
            progressPercent: validation.passed ? 100 : validation.score,
            completedAt: validation.passed ? now : null,
            lastSubmittedAt: now,
            submissionCount: { increment: 1 },
            xpAwarded: validation.passed ? xpToAward : 0
          }
        });

        if (xpToAward > 0) {
          await tx.user.update({
            where: { id: req.user.id },
            data: { xp: { increment: xpToAward } }
          });
        }
      });

      if (validation.passed) {
        await deleteSandbox(
          sandbox.sandboxId,
          req.user.id,
          sandboxOptions
        ).catch(() => {});
      }

      const refreshed = await findOwnedRun(prisma, req.user.id, run.id);
      const updatedUser = await prisma.user.findUnique({ where: { id: req.user.id } });
      res.json({
        message: validation.passed
          ? `Mission completed. ${xpToAward} XP awarded.`
          : "Mission checked. Review the feedback and try again.",
        passed: validation.passed,
        score: validation.score,
        checks: validation.checks,
        feedback: validation.feedback,
        xpAwarded: xpToAward,
        xp: updatedUser?.xp ?? req.user.xp,
        run: missionRunSummary(refreshed)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/mission-runs/:id/abandon", async (req, res, next) => {
    try {
      const runId = runIdSchema.parse(req.params.id);
      const run = await findOwnedRun(prisma, req.user.id, runId);
      if (!run) return res.status(404).json({ error: "Mission run not found." });
      const sandbox = run.sandboxSessions?.[0];
      if (sandbox && !["DELETED", "EXPIRED"].includes(sandbox.status)) {
        await deleteSandbox(sandbox.sandboxId, req.user.id, sandboxOptions).catch(() => {});
      }
      await prisma.missionRun.update({
        where: { id: run.id },
        data: { status: "FAILED", progressPercent: 0 }
      });
      res.json({ message: "Mission attempt abandoned." });
    } catch (error) {
      next(error);
    }
  });

  router.get("/leaderboard", async (req, res, next) => {
    try {
      const { xpLeaderboard, contributorLeaderboard } = await buildStudentLeaderboards(prisma);
      const currentXp = xpLeaderboard.find((row) => row.id === req.user.id) || null;
      const currentContribution = contributorLeaderboard.find((row) => row.id === req.user.id) || null;
      res.json({
        currentStudent: currentXp ? leaderboardRow(currentXp) : null,
        currentContributionRank: currentContribution?.rank || null,
        xpLeaderboard: xpLeaderboard.slice(0, 10).map(leaderboardRow),
        contributorLeaderboard: contributorLeaderboard.slice(0, 10).map(leaderboardRow)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/progress", async (req, res, next) => {
    try {
      const runs = await prisma.missionRun.findMany({
        where: { userId: req.user.id },
        orderBy: { updatedAt: "desc" },
        include: runInclude()
      });
      const completedUnique = new Set(
        runs.filter((run) => run.status === "COMPLETED").map((run) => run.missionTemplate.slug)
      );
      res.json({
        xp: { total: req.user.xp, ...levelFromXp(req.user.xp) },
        completedMissions: completedUnique.size,
        totalAttempts: runs.length,
        runs: runs.map(missionRunSummary)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/feedback", async (req, res, next) => {
    try {
      const feedback = await prisma.feedback.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          missionRun: {
            include: {
              missionTemplate: { select: { slug: true, title: true } },
              assessmentResult: true
            }
          }
        }
      });
      res.json({
        feedback: feedback.map((item) => ({
          id: item.id,
          code: item.code,
          language: item.language,
          message: item.message,
          details: item.details,
          createdAt: item.createdAt,
          mission: item.missionRun.missionTemplate,
          score: item.missionRun.assessmentResult?.totalScore ?? null,
          passed: item.missionRun.assessmentResult?.passed ?? null,
          runId: item.missionRunId
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/team/candidates", async (req, res, next) => {
    try {
      const membership = await prisma.teamMember.findFirst({ where: { userId: req.user.id }, select: { id: true } });
      if (membership) return res.json({ canCreate: false, students: [] });

      const users = await prisma.user.findMany({
        where: {
          role: UserRole.STUDENT,
          isActive: true,
          id: { not: req.user.id },
          teamMemberships: { none: {} }
        },
        orderBy: [{ xp: "desc" }, { createdAt: "asc" }],
        take: 250
      });
      res.json({
        canCreate: true,
        students: users.map((user) => ({
          id: user.id,
          fullName: decryptUserValue(user.fullName),
          universityId: decryptUserValue(user.universityId),
          xp: user.xp
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/team", async (req, res, next) => {
    try {
      const input = studentTeamSchema.parse(req.body);
      validateStudentTeamMembers(input.members, req.user.id);
      const ids = input.members.map((member) => member.userId);
      const [students, memberships] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: ids }, role: UserRole.STUDENT, isActive: true }, select: { id: true } }),
        prisma.teamMember.findMany({ where: { userId: { in: ids } }, select: { userId: true } })
      ]);
      if (students.length !== 3) return res.status(400).json({ error: "All team members must be active students." });
      if (memberships.length) return res.status(409).json({ error: "One or more selected students already belong to a team." });

      const team = await prisma.$transaction(async (tx) => {
        const created = await tx.team.create({ data: { name: input.name, createdById: req.user.id } });
        await tx.teamMember.createMany({
          data: input.members.map((member) => ({
            teamId: created.id,
            userId: member.userId,
            teamRole: member.teamRole
          }))
        });
        return created;
      });
      res.status(201).json({ message: "Team formed successfully.", team: { id: team.id, name: team.name } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/team", async (req, res, next) => {
    try {
      const membership = await prisma.teamMember.findFirst({
        where: { userId: req.user.id },
        include: {
          team: {
            include: {
              members: { include: { user: true } },
              assignments: {
                include: { missionTemplate: true },
                orderBy: { createdAt: "desc" }
              }
            }
          }
        }
      });
      if (!membership) return res.json({ team: null });

      res.json({
        team: {
          id: membership.team.id,
          name: membership.team.name,
          role: membership.teamRole,
          members: membership.team.members.map((member) => ({
            id: member.user.id,
            fullName: decryptUserValue(member.user.fullName),
            universityId: decryptUserValue(member.user.universityId),
            teamRole: member.teamRole,
            xp: member.user.xp
          })),
          assignments: membership.team.assignments.map((assignment) => ({
            id: assignment.id,
            status: assignment.status,
            startsAt: assignment.startsAt,
            dueAt: assignment.dueAt,
            mission: {
              slug: assignment.missionTemplate.slug,
              title: assignment.missionTemplate.title,
              description: assignment.missionTemplate.description
            }
          }))
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/profile", (req, res) => {
    res.json({ user: decryptPublicUser(req.user) });
  });

  router.patch("/profile", async (req, res, next) => {
    try {
      const input = profileSchema.parse(req.body);
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          fullName: encryptUserValue(input.fullName),
          department: encryptUserValue(input.department),
          semester: encryptUserValue(input.semester)
        }
      });
      res.json({ message: "Profile updated successfully.", user: decryptPublicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/profile/password", async (req, res, next) => {
    try {
      const input = passwordSchema.parse(req.body);
      const valid = await argon2.verify(req.user.passwordHash, input.currentPassword);
      if (!valid) return res.status(400).json({ error: "Current password is incorrect." });
      const passwordHash = await argon2.hash(input.newPassword, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1
      });
      await prisma.user.update({
        where: { id: req.user.id },
        data: { passwordHash }
      });
      res.json({ message: "Password changed successfully." });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
