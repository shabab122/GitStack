import "dotenv/config";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import argon2 from "argon2";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import { PrismaClient, UserRole } from "@prisma/client";
import { z } from "zod";

import { createSandboxRouter } from "./routes/sandbox-routes.js";
import { createStudentRouter } from "./routes/student-routes.js";
import { createInstructorRouter } from "./routes/instructor-routes.js";
import { createGiteaRouter } from "./routes/gitea-routes.js";
import { startSandboxCleanupScheduler } from "./services/sandbox/cleanup-service.js";
import { SandboxError } from "./services/sandbox/errors.js";
import { attachSandboxTerminalGateway } from "./services/sandbox/terminal-gateway.js";
import { createTerminalManager } from "./services/sandbox/terminal-manager.js";
import {
  backfillUserEncryption,
  decryptPublicUser,
  encryptedUserData,
  lookupHash,
  normalizeEmail,
  normalizeUniversityId
} from "./services/security/user-data-crypto.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const NODE_ENV = process.env.NODE_ENV ?? "development";
const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${PORT}`;
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? "gitstack_session";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "2h";
const JWT_SECRET = process.env.JWT_SECRET ?? "";

if (JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must be at least 32 characters. Copy .env.example to .env and set a secure value.");
  process.exit(1);
}

const prisma = new PrismaClient();
const app = express();
const terminalManager = createTerminalManager(console);
const publicDirectory = path.join(__dirname, "public");

app.disable("x-powered-by");
app.set("trust proxy", NODE_ENV === "production" ? 1 : false);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(
  cors({
    origin: APP_ORIGIN,
    credentials: true
  })
);
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Please try again later."
  }
});

const roleSchema = z.enum(["student", "instructor"]);

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  universityId: z.string().trim().min(3).max(50),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  department: z.string().trim().min(2).max(100),
  semester: z.string().trim().min(1).max(100),
  role: roleSchema,
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[a-z]/, "Password requires a lowercase letter.")
    .regex(/[A-Z]/, "Password requires an uppercase letter.")
    .regex(/[0-9]/, "Password requires a number.")
    .regex(/[^A-Za-z0-9]/, "Password requires a symbol.")
});

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  role: roleSchema,
  password: z.string().min(1).max(128)
});

function toDatabaseRole(role) {
  return role === "instructor" ? UserRole.INSTRUCTOR : UserRole.STUDENT;
}

function publicUser(user) {
  return decryptPublicUser(user);
}

function signSession(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      tokenVersion: 1
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
      issuer: "gitstack-api",
      audience: "gitstack-web"
    }
  );
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 2 * 60 * 60 * 1000
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "strict",
    path: "/"
  });
}

async function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: "gitstack-api",
      audience: "gitstack-web"
    });

    const user = await prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user || !user.isActive) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Session is no longer valid." });
    }

    req.user = await backfillUserEncryption(prisma, user);
    next();
  } catch {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Session is invalid or expired." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission for this action." });
    }
    next();
  };
}

app.get("/api/health", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      service: "gitstack-api",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/register", authLimiter, async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const role = toDatabaseRole(input.role);
    const normalizedEmail = normalizeEmail(input.email);
    const normalizedUniversityId = normalizeUniversityId(input.universityId);
    const emailLookupHash = lookupHash(normalizedEmail, "email");
    const universityIdLookupHash = lookupHash(normalizedUniversityId, "universityId");

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { emailLookupHash },
          { universityIdLookupHash },
          { email: normalizedEmail },
          { universityId: input.universityId }
        ]
      },
      select: {
        emailLookupHash: true,
        universityIdLookupHash: true,
        email: true,
        universityId: true
      }
    });

    if (existing) {
      const emailTaken =
        existing.emailLookupHash === emailLookupHash || existing.email === normalizedEmail;
      return res.status(409).json({
        error: emailTaken
          ? "An account already exists for this email."
          : "An account already exists for this university ID."
      });
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    });

    const user = await prisma.user.create({
      data: {
        ...encryptedUserData({
          fullName: input.fullName,
          universityId: input.universityId,
          email: normalizedEmail,
          department: input.department,
          semester: role === UserRole.STUDENT ? input.semester : null,
          designation: role === UserRole.INSTRUCTOR ? input.semester : null
        }),
        role,
        passwordHash
      }
    });

    const token = signSession(user);
    setSessionCookie(res, token);

    res.status(201).json({
      message: "Account created successfully.",
      user: publicUser(user)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", authLimiter, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const normalizedIdentifier = input.identifier.toLowerCase();
    const role = toDatabaseRole(input.role);
    const emailLookupHash = lookupHash(normalizedIdentifier, "email");
    const universityIdLookupHash = lookupHash(
      normalizeUniversityId(input.identifier),
      "universityId"
    );

    let user = await prisma.user.findFirst({
      where: {
        role,
        isActive: true,
        OR: [
          { emailLookupHash },
          { universityIdLookupHash },
          { email: normalizedIdentifier },
          { universityId: input.identifier }
        ]
      }
    });

    const validPassword = user
      ? await argon2.verify(user.passwordHash, input.password)
      : false;

    if (!user || !validPassword) {
      return res.status(401).json({
        error: "Invalid credentials or account role."
      });
    }

    user = await backfillUserEncryption(prisma, user);
    user = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const token = signSession(user);
    setSessionCookie(res, token);

    res.json({
      message: "Login successful.",
      user: publicUser(user)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get("/api/missions", async (_req, res, next) => {
  try {
    const missions = await prisma.missionTemplate.findMany({
      where: { isPublished: true },
      orderBy: [{ level: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        missionType: true,
        level: true,
        xpReward: true,
        estimatedMinutes: true
      }
    });

    res.json({
      missions: missions.map((mission) => ({
        ...mission,
        missionType: mission.missionType.toLowerCase()
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/missions/:slug", async (req, res, next) => {
  try {
    const mission = await prisma.missionTemplate.findFirst({
      where: {
        slug: req.params.slug,
        isPublished: true
      },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        missionType: true,
        level: true,
        xpReward: true,
        estimatedMinutes: true,
        instructions: true
      }
    });

    if (!mission) {
      return res.status(404).json({ error: "Mission not found." });
    }

    res.json({
      mission: {
        ...mission,
        missionType: mission.missionType.toLowerCase()
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/progress", requireAuth, async (req, res, next) => {
  try {
    const runs = await prisma.missionRun.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        missionTemplate: {
          select: {
            slug: true,
            title: true,
            level: true,
            xpReward: true
          }
        },
        assessmentResult: {
          select: {
            totalScore: true,
            passed: true,
            assessedAt: true
          }
        }
      }
    });

    res.json({
      xp: req.user.xp,
      runs
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/instructor/users",
  requireAuth,
  requireRole(UserRole.INSTRUCTOR, UserRole.ADMIN),
  async (_req, res, next) => {
    try {
      const students = await prisma.user.findMany({
        where: { role: UserRole.STUDENT },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        students: students.map((student) => ({
          ...publicUser(student),
          isActive: student.isActive
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

app.use(
  "/api/student",
  createStudentRouter({ requireAuth, prisma, terminalManager })
);

app.use(
  "/api/instructor",
  createInstructorRouter({ requireAuth, prisma })
);

app.use(
  "/api/gitea",
  createGiteaRouter({ requireAuth, prisma })
);

app.use(
  "/api/sandboxes",
  createSandboxRouter({ requireAuth, prisma, terminalManager })
);

app.use(express.static(publicDirectory, {
  extensions: ["html"],
  index: "home.html"
}));

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found." });
});

app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: "Validation failed.",
      fields: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  if (error instanceof SandboxError) {
    if (error.statusCode >= 500) {
      console.error(`[${error.code}]`, error.message);
    }

    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code
    });
  }

  console.error("Unhandled server error:", error);
  return res.status(500).json({
    error: "An unexpected server error occurred."
  });
});

const server = app.listen(PORT, () => {
  console.log(`GitStack running at http://localhost:${PORT}`);
  console.log(`Student dashboard: http://localhost:${PORT}/student-dashboard.html`);
  console.log(`Instructor dashboard: http://localhost:${PORT}/instructor-dashboard.html`);
  console.log(`Real sandbox terminal: http://localhost:${PORT}/sandbox-terminal.html`);
});

const detachSandboxTerminalGateway = attachSandboxTerminalGateway({
  server,
  prisma,
  terminalManager,
  cookieName: COOKIE_NAME,
  jwtSecret: JWT_SECRET,
  appOrigin: APP_ORIGIN,
  logger: console
});

const stopSandboxCleanup = startSandboxCleanupScheduler({
  prisma,
  terminalManager,
  logger: console
});

async function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down GitStack...`);
  stopSandboxCleanup();
  detachSandboxTerminalGateway();
  terminalManager.closeAll();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
