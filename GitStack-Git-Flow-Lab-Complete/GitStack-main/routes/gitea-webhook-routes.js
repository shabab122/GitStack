import express from "express";

import {
  processGiteaWebhook,
  verifyGiteaSignature
} from "../services/collaboration/collaboration-service.js";

export function createGiteaWebhookRouter({ prisma }) {
  const router = express.Router();

  router.post("/", async (req, res, next) => {
    try {
      const signature = req.get("X-Gitea-Signature") || "";
      const rawBody = req.rawBody;
      if (!verifyGiteaSignature(rawBody, signature)) {
        return res.status(401).json({ error: "Invalid Gitea webhook signature." });
      }

      const eventName = req.get("X-Gitea-Event") || "";
      const eventTypeName = req.get("X-Gitea-Event-Type") || "";
      const deliveryId = req.get("X-Gitea-Delivery") || "";
      const result = await processGiteaWebhook({ prisma, eventName, eventTypeName, deliveryId, payload: req.body || {} });
      return res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
