import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import {
  executeApprovedCommand,
  listApprovedCommands
} from "../services/sandbox/command-service.js";
import {
  createSandbox,
  deleteSandbox,
  getOwnedSandbox,
  listOwnedSandboxes,
  resetSandbox,
  startSandbox,
  stopSandbox,
  touchSandbox
} from "../services/sandbox/sandbox-service.js";

const sandboxIdSchema = z.string().uuid();
const createSchema = z
  .object({
    missionRunId: z.string().uuid().optional(),
    missionSlug: z.string().trim().min(2).max(100).optional(),
    mode: z.enum(["isolated", "collaboration"]).default("isolated")
  })
  .refine((value) => !(value.missionRunId && value.missionSlug), {
    message: "Use missionRunId or missionSlug, not both."
  });
const commandSchema = z.object({
  command: z.enum(listApprovedCommands())
});

const sandboxLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sandbox requests. Please slow down." }
});

export function createSandboxRouter({
  requireAuth,
  prisma,
  terminalManager
}) {
  const router = express.Router();
  const serviceOptions = { prisma, terminalManager };

  router.use(requireAuth, sandboxLimiter);

  router.get("/meta/commands", (_req, res) => {
    res.json({ commands: listApprovedCommands() });
  });

  router.get("/", async (req, res, next) => {
    try {
      const sandboxes = await listOwnedSandboxes(req.user.id, serviceOptions);
      res.json({ sandboxes });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const input = createSchema.parse(req.body || {});
      const sandbox = await createSandbox(req.user.id, {
        ...serviceOptions,
        ...input
      });
      res.status(201).json({ sandbox });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const sandboxId = sandboxIdSchema.parse(req.params.id);
      const sandbox = await getOwnedSandbox(
        sandboxId,
        req.user.id,
        serviceOptions
      );
      res.json({ sandbox });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/start", async (req, res, next) => {
    try {
      const sandboxId = sandboxIdSchema.parse(req.params.id);
      const sandbox = await startSandbox(
        sandboxId,
        req.user.id,
        serviceOptions
      );
      res.json({ message: "Sandbox started successfully.", sandbox });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/stop", async (req, res, next) => {
    try {
      const sandboxId = sandboxIdSchema.parse(req.params.id);
      const sandbox = await stopSandbox(
        sandboxId,
        req.user.id,
        serviceOptions
      );
      res.json({ message: "Sandbox stopped successfully.", sandbox });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/reset", async (req, res, next) => {
    try {
      const sandboxId = sandboxIdSchema.parse(req.params.id);
      const sandbox = await resetSandbox(
        sandboxId,
        req.user.id,
        serviceOptions
      );
      res.json({ message: "Sandbox reset successfully.", sandbox });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const sandboxId = sandboxIdSchema.parse(req.params.id);
      const result = await deleteSandbox(
        sandboxId,
        req.user.id,
        serviceOptions
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/commands", async (req, res, next) => {
    try {
      const sandboxId = sandboxIdSchema.parse(req.params.id);
      const input = commandSchema.parse(req.body);
      await getOwnedSandbox(sandboxId, req.user.id, serviceOptions);
      const result = await executeApprovedCommand(sandboxId, input.command);
      await touchSandbox(sandboxId, serviceOptions);
      res.json({ result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
