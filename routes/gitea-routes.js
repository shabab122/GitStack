import express from "express";
import { createRepository, createPullRequest, getRepository } from "../services/gitea/gitea-client.js";

export function createGiteaRouter() {
  const router = express.Router();

  router.post("/repository", async (req, res) => {
    try {
      const repository = await createRepository(req.body);
      res.json(repository);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/pull-request", async (req, res) => {
    try {
      const pullRequest = await createPullRequest(req.body);
      res.json(pullRequest);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/repository/:owner/:repo", async (req, res) => {
    try {
      res.json(await getRepository(req.params.owner, req.params.repo));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
