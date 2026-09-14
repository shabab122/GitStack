import express from "express";
import argon2 from "argon2";
import { AssignmentStatus, MissionType, TeamRole, UserRole } from "@prisma/client";
import { z } from "zod";

import {
  decryptPublicUser,
  decryptUserValue,
  encryptUserValue
} from "../services/security/user-data-crypto.js";
import { buildStudentLeaderboards } from "../services/leaderboard/leaderboard-service.js";

const idSchema = z.string().uuid();
const assignmentStatusSchema = z.nativeEnum(AssignmentStatus);
const teamRoleSchema = z.nativeEnum(TeamRole);
const assignmentCreateSchema = z.object({
  missionTemplateId: z.string().uuid(),
  targetType: z.enum(["student", "team"]),
  targetId: z.string().uuid(),
  status: assignmentStatusSchema.default(AssignmentStatus.ACTIVE),
  startsAt: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional()
});
const assignmentUpdateSchema = z.object({
  status: assignmentStatusSchema.optional(),
  startsAt: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional()
});
const teamMemberSchema = z.object({
  userId: z.string().uuid(),
  teamRole: teamRoleSchema
});
const teamSchema = z.object({
  name: z.string().trim().min(2).max(80),
  members: z.array(teamMemberSchema).length(3)
});
const missionRuleSchema = z.object({
  repositoryInitialized: z.boolean().optional(),
  requiredFile: z.string().trim().max(180).regex(/^[A-Za-z0-9._\/-]*$/, "Required file contains unsupported characters.").optional(),
  fileMustBeTracked: z.boolean().optional(),
  minimumCommits: z.number().int().min(0).max(50).optional(),
  minimumCommitMessageLength: z.number().int().min(0).max(120).optional(),
  requiredBranchPrefix: z.string().trim().max(80).regex(/^[A-Za-z0-9._\/-]*$/, "Branch prefix contains unsupported characters.").optional(),
  finishOnBranch: z.string().trim().max(80).regex(/^[A-Za-z0-9._\/-]*$/, "Branch name contains unsupported characters.").optional(),
  cleanWorkingTree: z.boolean().optional()
}).strict();

const missionCreateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  slug: z.string().trim().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: z.string().trim().min(10).max(600),
  missionType: z.nativeEnum(MissionType).default(MissionType.INDIVIDUAL),
  level: z.number().int().min(1).max(20),
  xpReward: z.number().int().min(0).max(5000),
  estimatedMinutes: z.number().int().min(5).max(240).nullable().optional(),
  objective: z.string().trim().min(5).max(500),
  steps: z.array(z.string().trim().min(2).max(240)).min(1).max(12),
  validationRules: missionRuleSchema.default({ repositoryInitialized: true }),
  isPublished: z.boolean().default(false)
});

const missionUpdateSchema = missionCreateSchema.partial().extend({
  isPublished: z.boolean().optional()
});

function hasEffectiveIndividualRule(rules) {
  if (!rules || typeof rules !== "object") return false;
  return Boolean(
    rules.repositoryInitialized === true ||
    (typeof rules.requiredFile === "string" && rules.requiredFile.trim()) ||
    (Number.isInteger(rules.minimumCommits) && rules.minimumCommits > 0) ||
    (Number.isInteger(rules.minimumCommitMessageLength) && rules.minimumCommitMessageLength > 0) ||
    (typeof rules.requiredBranchPrefix === "string" && rules.requiredBranchPrefix.trim()) ||
    (typeof rules.finishOnBranch === "string" && rules.finishOnBranch.trim()) ||
    rules.cleanWorkingTree === true
  );
}
const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  department: z.string().trim().min(2).max(100),
  designation: z.string().trim().min(2).max(100)
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

function requireInstructor(req, res, next) {
  if (!req.user || ![UserRole.INSTRUCTOR, UserRole.ADMIN].includes(req.user.role)) {
    return res.status(403).json({ error: "Instructor access is required." });
  }
  next();
}

function asDate(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assignmentSummary(assignment) {
  const student = assignment.student
    ? {
        id: assignment.student.id,
        fullName: decryptUserValue(assignment.student.fullName),
        universityId: decryptUserValue(assignment.student.universityId)
      }
    : null;
  return {
    id: assignment.id,
    status: assignment.status,
    startsAt: assignment.startsAt,
    dueAt: assignment.dueAt,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    mission: assignment.missionTemplate
      ? {
          id: assignment.missionTemplate.id,
          slug: assignment.missionTemplate.slug,
          title: assignment.missionTemplate.title,
          missionType: assignment.missionTemplate.missionType,
          xpReward: assignment.missionTemplate.xpReward
        }
      : null,
    student,
    team: assignment.team
      ? {
          id: assignment.team.id,
          name: assignment.team.name,
          memberCount: assignment.team.members?.length ?? undefined
        }
      : null,
    runCount: assignment._count?.missionRuns ?? undefined
  };
}

function validateTeamMembers(members) {
  const ids = new Set(members.map((member) => member.userId));
  const roles = new Set(members.map((member) => member.teamRole));
  if (ids.size !== 3) {
    const error = new Error("A GitStack team must contain three different students.");
    error.statusCode = 400;
    throw error;
  }
  if (roles.size !== 3) {
    const error = new Error("Assign one Feature Developer, one Test Developer and one Code Reviewer.");
    error.statusCode = 400;
    throw error;
  }
}

function collectRuleFailures(results) {
  const counts = new Map();
  for (const result of results) {
    const rules = Array.isArray(result.ruleResults) ? result.ruleResults : [];
    for (const rule of rules) {
      if (rule?.passed !== false) continue;
      const key = String(rule.code || rule.label || "Workflow check");
      const current = counts.get(key) || { code: key, label: String(rule.label || key), count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

function activityName(user) {
  return user ? decryptUserValue(user.fullName) : "Unknown student";
}

function slugifyMissionTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90) || `mission-${Date.now()}`;
}

function missionInstructions(input, existing = null) {
  const previous = existing && typeof existing === "object" ? existing : {};
  return {
    ...previous,
    objective: input.objective ?? previous.objective ?? "",
    workspace: "/workspace",
    steps: input.steps ?? (Array.isArray(previous.steps) ? previous.steps : [])
  };
}

function publicLeaderboardRow(row) {
  return {
    id: row.id,
    xp: row.xp,
    rank: row.rank,
    milestone: row.milestone || null,
    completedMissions: row.completedMissions,
    passedAssessments: row.passedAssessments,
    attempts: row.attempts,
    inProgressMissions: row.inProgressMissions,
    contributionScore: row.contributionScore,
    fullName: decryptUserValue(row.fullNameEncrypted),
    universityId: decryptUserValue(row.universityIdEncrypted),
    department: decryptUserValue(row.departmentEncrypted),
    semester: decryptUserValue(row.semesterEncrypted)
  };
}

export function createInstructorRouter({ requireAuth, prisma }) {
  const router = express.Router();
  router.use(requireAuth, requireInstructor);

  router.get("/dashboard", async (req, res, next) => {
    try {
      const [students, teams, missions, activeAssignments, runs, assessments, recentUsers, recentRuns, recentAssignments] = await Promise.all([
        prisma.user.count({ where: { role: UserRole.STUDENT, isActive: true } }),
        prisma.team.count(),
        prisma.missionTemplate.count({ where: { isPublished: true } }),
        prisma.assignment.count({ where: { createdById: req.user.id, status: AssignmentStatus.ACTIVE } }),
        prisma.missionRun.count({ where: { userId: { not: null } } }),
        prisma.assessmentResult.findMany({ orderBy: { assessedAt: "desc" }, take: 200 }),
        prisma.user.findMany({ where: { role: UserRole.STUDENT }, orderBy: { createdAt: "desc" }, take: 5 }),
        prisma.missionRun.findMany({
          where: { userId: { not: null } },
          include: { user: true, missionTemplate: true, assessmentResult: true },
          orderBy: { updatedAt: "desc" },
          take: 8
        }),
        prisma.assignment.findMany({
          where: { createdById: req.user.id },
          include: { missionTemplate: true, student: true, team: true },
          orderBy: { createdAt: "desc" },
          take: 5
        })
      ]);

      const completedRuns = await prisma.missionRun.count({ where: { status: "COMPLETED", userId: { not: null } } });
      const xpAggregate = await prisma.user.aggregate({
        where: { role: UserRole.STUDENT, isActive: true },
        _avg: { xp: true }
      });
      const assessed = assessments.length;
      const averageScore = assessed
        ? Math.round(assessments.reduce((sum, row) => sum + row.totalScore, 0) / assessed)
        : 0;

      const activity = [
        ...recentUsers.map((user) => ({
          type: "STUDENT_REGISTERED",
          title: `${activityName(user)} registered`,
          detail: decryptUserValue(user.universityId),
          at: user.createdAt
        })),
        ...recentRuns.map((run) => ({
          type: `MISSION_${run.status}`,
          title: `${activityName(run.user)} · ${run.missionTemplate.title}`,
          detail: run.status.replaceAll("_", " "),
          at: run.updatedAt
        })),
        ...recentAssignments.map((assignment) => ({
          type: "MISSION_ASSIGNED",
          title: `Assigned ${assignment.missionTemplate.title}`,
          detail: assignment.student
            ? activityName(assignment.student)
            : assignment.team?.name || "Team",
          at: assignment.createdAt
        }))
      ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10);

      res.json({
        instructor: decryptPublicUser(req.user),
        statistics: {
          students,
          teams,
          missions,
          activeAssignments,
          completedRuns,
          totalRuns: runs,
          completionPercent: runs ? Math.round((completedRuns / runs) * 100) : 0,
          averageXp: Math.round(xpAggregate._avg.xp || 0),
          averageScore
        },
        commonMistakes: collectRuleFailures(assessments),
        recentActivity: activity,
        recentAssignments: recentAssignments.map(assignmentSummary)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/students", async (req, res, next) => {
    try {
      const users = await prisma.user.findMany({
        where: { role: UserRole.STUDENT },
        orderBy: { createdAt: "desc" },
        take: 500,
        include: {
          teamMemberships: { include: { team: true } },
          missionRuns: {
            select: { status: true, xpAwarded: true, updatedAt: true }
          }
        }
      });
      const search = String(req.query.search || "").trim().toLowerCase();
      const department = String(req.query.department || "").trim().toLowerCase();
      const semester = String(req.query.semester || "").trim().toLowerCase();
      const students = users.map((user) => {
        const profile = decryptPublicUser(user);
        const completed = user.missionRuns.filter((run) => run.status === "COMPLETED").length;
        const active = user.missionRuns.filter((run) => run.status === "IN_PROGRESS").length;
        return {
          ...profile,
          isActive: user.isActive,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          completedMissions: completed,
          activeMissions: active,
          attempts: user.missionRuns.length,
          team: user.teamMemberships[0]
            ? { id: user.teamMemberships[0].team.id, name: user.teamMemberships[0].team.name, role: user.teamMemberships[0].teamRole }
            : null
        };
      }).filter((student) => {
        const haystack = `${student.fullName} ${student.email} ${student.universityId}`.toLowerCase();
        if (search && !haystack.includes(search)) return false;
        if (department && String(student.department || "").toLowerCase() !== department) return false;
        if (semester && String(student.semester || "").toLowerCase() !== semester) return false;
        return true;
      });
      res.json({ students });
    } catch (error) {
      next(error);
    }
  });

  router.get("/students/:id", async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const user = await prisma.user.findFirst({
        where: { id, role: UserRole.STUDENT },
        include: {
          teamMemberships: { include: { team: true } },
          missionRuns: {
            include: { missionTemplate: true, assessmentResult: true, feedback: { orderBy: { createdAt: "desc" }, take: 3 } },
            orderBy: { updatedAt: "desc" },
            take: 50
          },
          studentAssignments: {
            include: { missionTemplate: true, createdBy: true },
            orderBy: { createdAt: "desc" }
          }
        }
      });
      if (!user) return res.status(404).json({ error: "Student not found." });
      res.json({
        student: {
          ...decryptPublicUser(user),
          isActive: user.isActive,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          team: user.teamMemberships[0]
            ? { id: user.teamMemberships[0].team.id, name: user.teamMemberships[0].team.name, role: user.teamMemberships[0].teamRole }
            : null
        },
        runs: user.missionRuns.map((run) => ({
          id: run.id,
          status: run.status,
          attemptNumber: run.attemptNumber,
          progressPercent: run.progressPercent,
          xpAwarded: run.xpAwarded,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          updatedAt: run.updatedAt,
          mission: { slug: run.missionTemplate.slug, title: run.missionTemplate.title, xpReward: run.missionTemplate.xpReward },
          assessment: run.assessmentResult
            ? { score: run.assessmentResult.totalScore, passed: run.assessmentResult.passed, assessedAt: run.assessmentResult.assessedAt }
            : null,
          feedback: run.feedback.map((item) => ({ code: item.code, message: item.message, language: item.language }))
        })),
        assignments: user.studentAssignments.map(assignmentSummary)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/missions", async (req, res, next) => {
    try {
      const missions = await prisma.missionTemplate.findMany({
        orderBy: [{ missionType: "asc" }, { level: "asc" }, { createdAt: "desc" }],
        include: {
          createdBy: { select: { id: true, role: true, fullName: true } },
          _count: { select: { assignments: true, missionRuns: true } },
          missionRuns: {
            select: { status: true, assessmentResult: { select: { totalScore: true, passed: true } } }
          }
        }
      });
      res.json({
        missions: missions.map((mission) => {
          const completed = mission.missionRuns.filter((run) => run.status === "COMPLETED").length;
          const assessed = mission.missionRuns.filter((run) => run.assessmentResult);
          return {
            id: mission.id,
            slug: mission.slug,
            title: mission.title,
            description: mission.description,
            missionType: mission.missionType,
            level: mission.level,
            xpReward: mission.xpReward,
            estimatedMinutes: mission.estimatedMinutes,
            isPublished: mission.isPublished,
            createdById: mission.createdById,
            createdBy: mission.createdBy ? {
              id: mission.createdBy.id,
              role: mission.createdBy.role,
              fullName: decryptUserValue(mission.createdBy.fullName)
            } : null,
            editable: Boolean(mission.createdById) && (mission.createdById === req.user.id || req.user.role === UserRole.ADMIN),
            deletable: Boolean(mission.createdById) && (mission.createdById === req.user.id || req.user.role === UserRole.ADMIN),
            instructions: mission.instructions,
            validationRules: mission.validationRules,
            assignmentCount: mission._count.assignments,
            attemptCount: mission._count.missionRuns,
            completedCount: completed,
            completionPercent: mission._count.missionRuns ? Math.round((completed / mission._count.missionRuns) * 100) : 0,
            averageScore: assessed.length
              ? Math.round(assessed.reduce((sum, run) => sum + run.assessmentResult.totalScore, 0) / assessed.length)
              : null,
            giteaRequired: mission.missionType === MissionType.TEAM
          };
        })
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/missions", async (req, res, next) => {
    try {
      const input = missionCreateSchema.parse(req.body);
      if (input.missionType === MissionType.INDIVIDUAL && !hasEffectiveIndividualRule(input.validationRules)) {
        return res.status(400).json({ error: "Individual missions require at least one effective automatic validation rule." });
      }
      const baseSlug = input.slug || slugifyMissionTitle(input.title);
      let slug = baseSlug;
      let suffix = 2;
      while (await prisma.missionTemplate.findUnique({ where: { slug }, select: { id: true } })) {
        slug = `${baseSlug}-${suffix++}`;
      }

      const mission = await prisma.missionTemplate.create({
        data: {
          createdById: req.user.id,
          slug,
          title: input.title,
          description: input.description,
          missionType: input.missionType,
          level: input.level,
          xpReward: input.xpReward,
          estimatedMinutes: input.estimatedMinutes ?? null,
          instructions: missionInstructions(input),
          validationRules: input.validationRules,
          isPublished: input.isPublished
        }
      });
      res.status(201).json({ message: "Mission created successfully.", mission });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/missions/:id", async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const input = missionUpdateSchema.parse(req.body);
      const existing = await prisma.missionTemplate.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Mission not found." });
      const isSystemMission = !existing.createdById;
      if (isSystemMission) {
        return res.status(403).json({ error: "Built-in system missions are read-only. Create a custom mission to change mission rules or content." });
      }
      const canEdit = existing.createdById === req.user.id || req.user.role === UserRole.ADMIN;
      if (!canEdit) return res.status(403).json({ error: "You can only edit missions you created." });

      let slug = existing.slug;
      if (input.slug && input.slug !== existing.slug) {
        const duplicate = await prisma.missionTemplate.findUnique({ where: { slug: input.slug } });
        if (duplicate) return res.status(409).json({ error: "That mission slug is already in use." });
        slug = input.slug;
      }

      const nextMissionType = input.missionType ?? existing.missionType;
      const nextValidationRules = input.validationRules ?? existing.validationRules;
      if (nextMissionType === MissionType.INDIVIDUAL && !hasEffectiveIndividualRule(nextValidationRules)) {
        return res.status(400).json({ error: "Individual missions require at least one effective automatic validation rule." });
      }

      const mission = await prisma.missionTemplate.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.slug !== undefined ? { slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.missionType !== undefined ? { missionType: input.missionType } : {}),
          ...(input.level !== undefined ? { level: input.level } : {}),
          ...(input.xpReward !== undefined ? { xpReward: input.xpReward } : {}),
          ...(input.estimatedMinutes !== undefined ? { estimatedMinutes: input.estimatedMinutes } : {}),
          ...(input.objective !== undefined || input.steps !== undefined
            ? { instructions: missionInstructions(input, existing.instructions) }
            : {}),
          ...(input.validationRules !== undefined ? { validationRules: input.validationRules } : {}),
          ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {})
        }
      });
      res.json({ message: "Mission updated successfully.", mission });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/missions/:id", async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const existing = await prisma.missionTemplate.findUnique({
        where: { id },
        include: { _count: { select: { assignments: true, missionRuns: true } } }
      });
      if (!existing) return res.status(404).json({ error: "Mission not found." });
      if (!existing.createdById) {
        return res.status(403).json({ error: "Built-in system missions cannot be deleted." });
      }
      if (existing.createdById !== req.user.id && req.user.role !== UserRole.ADMIN) {
        return res.status(403).json({ error: "Only the creator can delete a custom mission." });
      }
      if (existing._count.assignments || existing._count.missionRuns) {
        return res.status(409).json({ error: "This mission already has assignment or attempt history. Unpublish it instead of deleting it." });
      }
      await prisma.missionTemplate.delete({ where: { id } });
      res.json({ message: "Mission deleted." });
    } catch (error) {
      next(error);
    }
  });

  router.get("/leaderboard", async (_req, res, next) => {
    try {
      const { xpLeaderboard, contributorLeaderboard } = await buildStudentLeaderboards(prisma);
      res.json({
        xpLeaderboard: xpLeaderboard.map(publicLeaderboardRow),
        contributorLeaderboard: contributorLeaderboard.map(publicLeaderboardRow),
        contributionFormula: "20 × completed missions + 10 × passed assessments + 2 × attempts (max 25) + 2 × active missions"
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/assignments", async (req, res, next) => {
    try {
      const assignments = await prisma.assignment.findMany({
        where: { createdById: req.user.id },
        include: {
          missionTemplate: true,
          student: true,
          team: { include: { members: true } },
          _count: { select: { missionRuns: true } }
        },
        orderBy: { createdAt: "desc" }
      });
      res.json({ assignments: assignments.map(assignmentSummary) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/assignments", async (req, res, next) => {
    try {
      const input = assignmentCreateSchema.parse(req.body);
      const mission = await prisma.missionTemplate.findUnique({ where: { id: input.missionTemplateId } });
      if (!mission || !mission.isPublished) return res.status(404).json({ error: "Published mission not found." });
      if (input.targetType === "student" && mission.missionType !== MissionType.INDIVIDUAL) {
        return res.status(400).json({ error: "Team missions must be assigned to a three-person team." });
      }
      if (input.targetType === "team" && mission.missionType !== MissionType.TEAM) {
        return res.status(400).json({ error: "Individual missions must be assigned directly to a student." });
      }
      const startsAt = asDate(input.startsAt);
      const dueAt = asDate(input.dueAt);
      if (startsAt && dueAt && dueAt <= startsAt) {
        return res.status(400).json({ error: "Due date must be after the start date." });
      }

      let studentId = null;
      let teamId = null;
      if (input.targetType === "student") {
        const student = await prisma.user.findFirst({ where: { id: input.targetId, role: UserRole.STUDENT, isActive: true } });
        if (!student) return res.status(404).json({ error: "Student not found." });
        studentId = student.id;
      } else {
        const team = await prisma.team.findFirst({
          where: { id: input.targetId },
          include: { members: true }
        });
        if (!team) return res.status(404).json({ error: "Team not found." });
        if (team.members.length !== 3) return res.status(409).json({ error: "Team missions require exactly three team members." });
        teamId = team.id;
      }

      const duplicate = await prisma.assignment.findFirst({
        where: {
          missionTemplateId: mission.id,
          createdById: req.user.id,
          status: { in: [AssignmentStatus.DRAFT, AssignmentStatus.ACTIVE] },
          ...(studentId ? { studentId } : { teamId })
        }
      });
      if (duplicate) return res.status(409).json({ error: "An open assignment already exists for this mission and target." });

      const assignment = await prisma.assignment.create({
        data: {
          missionTemplateId: mission.id,
          studentId,
          teamId,
          createdById: req.user.id,
          status: input.status,
          startsAt,
          dueAt
        },
        include: { missionTemplate: true, student: true, team: { include: { members: true } }, _count: { select: { missionRuns: true } } }
      });
      res.status(201).json({ message: "Mission assigned successfully.", assignment: assignmentSummary(assignment) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/assignments/:id", async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const input = assignmentUpdateSchema.parse(req.body);
      const existing = await prisma.assignment.findFirst({ where: { id, createdById: req.user.id } });
      if (!existing) return res.status(404).json({ error: "Assignment not found." });
      const startsAt = input.startsAt === undefined ? existing.startsAt : asDate(input.startsAt);
      const dueAt = input.dueAt === undefined ? existing.dueAt : asDate(input.dueAt);
      if (startsAt && dueAt && dueAt <= startsAt) {
        return res.status(400).json({ error: "Due date must be after the start date." });
      }
      const assignment = await prisma.assignment.update({
        where: { id },
        data: {
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.startsAt !== undefined ? { startsAt } : {}),
          ...(input.dueAt !== undefined ? { dueAt } : {})
        },
        include: { missionTemplate: true, student: true, team: { include: { members: true } }, _count: { select: { missionRuns: true } } }
      });
      res.json({ message: "Assignment updated successfully.", assignment: assignmentSummary(assignment) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/assignments/:id", async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const existing = await prisma.assignment.findFirst({
        where: { id, createdById: req.user.id },
        include: { _count: { select: { missionRuns: true } } }
      });
      if (!existing) return res.status(404).json({ error: "Assignment not found." });
      if (existing._count.missionRuns > 0) {
        return res.status(409).json({ error: "This assignment already has mission history. Close it instead of deleting it." });
      }
      await prisma.assignment.delete({ where: { id } });
      res.json({ message: "Assignment deleted." });
    } catch (error) {
      next(error);
    }
  });

  router.get("/teams", async (req, res, next) => {
    try {
      const teams = await prisma.team.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { id: true, role: true, fullName: true } },
          members: { include: { user: true }, orderBy: { joinedAt: "asc" } },
          assignments: { include: { missionTemplate: true }, orderBy: { createdAt: "desc" } },
          _count: { select: { missionRuns: true } }
        }
      });
      res.json({
        teams: teams.map((team) => ({
          id: team.id,
          name: team.name,
          createdAt: team.createdAt,
          ownership: team.createdBy ? {
            creatorId: team.createdBy.id,
            creatorRole: team.createdBy.role,
            creatorName: decryptUserValue(team.createdBy.fullName),
            instructorOwned: team.createdBy.id === req.user.id
          } : { creatorId: null, creatorRole: null, creatorName: "Legacy team", instructorOwned: false },
          members: team.members.map((member) => ({
            id: member.user.id,
            fullName: decryptUserValue(member.user.fullName),
            universityId: decryptUserValue(member.user.universityId),
            xp: member.user.xp,
            teamRole: member.teamRole
          })),
          assignments: team.assignments.map((assignment) => ({
            id: assignment.id,
            status: assignment.status,
            dueAt: assignment.dueAt,
            mission: { title: assignment.missionTemplate.title, slug: assignment.missionTemplate.slug }
          })),
          runCount: team._count.missionRuns,
          giteaReady: false
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/teams", async (req, res, next) => {
    try {
      const input = teamSchema.parse(req.body);
      validateTeamMembers(input.members);
      const ids = input.members.map((member) => member.userId);
      const [students, existingMemberships] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: ids }, role: UserRole.STUDENT, isActive: true }, select: { id: true } }),
        prisma.teamMember.findMany({ where: { userId: { in: ids } }, include: { team: true } })
      ]);
      if (students.length !== 3) return res.status(400).json({ error: "All three team members must be active students." });
      if (existingMemberships.length) {
        return res.status(409).json({ error: "One or more selected students already belong to a team." });
      }
      const team = await prisma.$transaction(async (tx) => {
        const created = await tx.team.create({ data: { name: input.name, createdById: req.user.id } });
        await tx.teamMember.createMany({
          data: input.members.map((member) => ({ teamId: created.id, userId: member.userId, teamRole: member.teamRole }))
        });
        return tx.team.findUnique({
          where: { id: created.id },
          include: { members: { include: { user: true } }, assignments: { include: { missionTemplate: true } }, _count: { select: { missionRuns: true } } }
        });
      });
      res.status(201).json({ message: "Three-person team created successfully.", team: { id: team.id, name: team.name } });
    } catch (error) {
      if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
      next(error);
    }
  });

  router.patch("/teams/:id", async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const input = teamSchema.parse(req.body);
      validateTeamMembers(input.members);
      const existingTeam = await prisma.team.findFirst({ where: { id, createdById: req.user.id }, include: { members: true } });
      if (!existingTeam) return res.status(404).json({ error: "Team not found." });
      const ids = input.members.map((member) => member.userId);
      const students = await prisma.user.findMany({ where: { id: { in: ids }, role: UserRole.STUDENT, isActive: true }, select: { id: true } });
      if (students.length !== 3) return res.status(400).json({ error: "All three team members must be active students." });
      const conflicts = await prisma.teamMember.findMany({ where: { userId: { in: ids }, teamId: { not: id } } });
      if (conflicts.length) return res.status(409).json({ error: "One or more selected students already belong to another team." });
      await prisma.$transaction(async (tx) => {
        await tx.team.update({ where: { id }, data: { name: input.name } });
        await tx.teamMember.deleteMany({ where: { teamId: id } });
        await tx.teamMember.createMany({ data: input.members.map((member) => ({ teamId: id, userId: member.userId, teamRole: member.teamRole })) });
      });
      res.json({ message: "Team updated successfully." });
    } catch (error) {
      if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
      next(error);
    }
  });

  router.delete("/teams/:id", async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const team = await prisma.team.findFirst({
        where: { id, createdById: req.user.id },
        include: { _count: { select: { assignments: true, missionRuns: true } } }
      });
      if (!team) return res.status(404).json({ error: "Team not found." });
      if (team._count.assignments > 0 || team._count.missionRuns > 0) {
        return res.status(409).json({ error: "This team has assignment history and cannot be deleted." });
      }
      await prisma.team.delete({ where: { id } });
      res.json({ message: "Team deleted." });
    } catch (error) {
      next(error);
    }
  });

  router.get("/assessments", async (_req, res, next) => {
    try {
      const results = await prisma.assessmentResult.findMany({
        where: { missionRun: { userId: { not: null } } },
        orderBy: { assessedAt: "desc" },
        take: 250,
        include: {
          missionRun: { include: { user: true, missionTemplate: true, feedback: { orderBy: { createdAt: "desc" }, take: 2 } } }
        }
      });
      res.json({
        assessments: results.map((result) => ({
          id: result.id,
          score: result.totalScore,
          individualScore: result.individualScore,
          teamScore: result.teamScore,
          passed: result.passed,
          assessedAt: result.assessedAt,
          ruleResults: result.ruleResults,
          runId: result.missionRunId,
          attemptNumber: result.missionRun.attemptNumber,
          student: result.missionRun.user
            ? { id: result.missionRun.user.id, fullName: activityName(result.missionRun.user), universityId: decryptUserValue(result.missionRun.user.universityId) }
            : null,
          mission: { id: result.missionRun.missionTemplate.id, title: result.missionRun.missionTemplate.title, slug: result.missionRun.missionTemplate.slug },
          feedback: result.missionRun.feedback.map((item) => ({ message: item.message, language: item.language, code: item.code }))
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/analytics", async (_req, res, next) => {
    try {
      const [students, missions, assessments, teamCount, membershipCount] = await Promise.all([
        prisma.user.findMany({ where: { role: UserRole.STUDENT }, select: { id: true, xp: true, isActive: true } }),
        prisma.missionTemplate.findMany({
          where: { isPublished: true },
          include: { missionRuns: { select: { status: true, assessmentResult: { select: { totalScore: true, passed: true } } } } }
        }),
        prisma.assessmentResult.findMany({ orderBy: { assessedAt: "desc" }, take: 500 }),
        prisma.team.count(),
        prisma.teamMember.count()
      ]);
      const xpBands = [
        { label: "0–99 XP", min: 0, max: 99 },
        { label: "100–249 XP", min: 100, max: 249 },
        { label: "250–499 XP", min: 250, max: 499 },
        { label: "500+ XP", min: 500, max: Infinity }
      ].map((band) => ({ ...band, count: students.filter((student) => student.xp >= band.min && student.xp <= band.max).length }));
      const missionPerformance = missions.map((mission) => {
        const runs = mission.missionRuns;
        const completed = runs.filter((run) => run.status === "COMPLETED").length;
        const scored = runs.filter((run) => run.assessmentResult);
        return {
          id: mission.id,
          title: mission.title,
          missionType: mission.missionType,
          attempts: runs.length,
          completed,
          completionPercent: runs.length ? Math.round((completed / runs.length) * 100) : 0,
          averageScore: scored.length ? Math.round(scored.reduce((sum, run) => sum + run.assessmentResult.totalScore, 0) / scored.length) : null
        };
      });
      res.json({
        overview: {
          students: students.length,
          activeStudents: students.filter((student) => student.isActive).length,
          teams: teamCount,
          studentsInTeams: membershipCount,
          averageXp: students.length ? Math.round(students.reduce((sum, student) => sum + student.xp, 0) / students.length) : 0,
          averageScore: assessments.length ? Math.round(assessments.reduce((sum, item) => sum + item.totalScore, 0) / assessments.length) : 0,
          passRate: assessments.length ? Math.round((assessments.filter((item) => item.passed).length / assessments.length) * 100) : 0
        },
        xpBands,
        missionPerformance,
        commonMistakes: collectRuleFailures(assessments)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/activity", async (req, res, next) => {
    try {
      const [users, runs, assignments, sandboxes] = await Promise.all([
        prisma.user.findMany({ where: { role: UserRole.STUDENT }, orderBy: { createdAt: "desc" }, take: 25 }),
        prisma.missionRun.findMany({ where: { userId: { not: null } }, include: { user: true, missionTemplate: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
        prisma.assignment.findMany({ where: { createdById: req.user.id }, include: { missionTemplate: true, student: true, team: true }, orderBy: { updatedAt: "desc" }, take: 30 }),
        prisma.sandboxSession.findMany({ include: { user: true }, orderBy: { updatedAt: "desc" }, take: 30 })
      ]);
      const activity = [
        ...users.map((user) => ({ type: "STUDENT_REGISTERED", title: `${activityName(user)} registered`, detail: decryptUserValue(user.universityId), at: user.createdAt })),
        ...runs.map((run) => ({ type: `MISSION_${run.status}`, title: `${activityName(run.user)} · ${run.missionTemplate.title}`, detail: `Attempt ${run.attemptNumber} · ${run.status.replaceAll("_", " ")}`, at: run.updatedAt })),
        ...assignments.map((assignment) => ({ type: "ASSIGNMENT", title: `${assignment.missionTemplate.title} assigned`, detail: assignment.student ? activityName(assignment.student) : assignment.team?.name || "Team", at: assignment.updatedAt })),
        ...sandboxes.filter((session) => session.user).map((session) => ({ type: `SANDBOX_${session.status}`, title: `${activityName(session.user)} sandbox`, detail: session.status.replaceAll("_", " "), at: session.updatedAt }))
      ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 100);
      res.json({ activity });
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
          designation: encryptUserValue(input.designation)
        }
      });
      res.json({ message: "Instructor profile updated successfully.", user: decryptPublicUser(user) });
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
      await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
      res.json({ message: "Password changed successfully." });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
