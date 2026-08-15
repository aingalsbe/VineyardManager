import { Router } from "express";
import { API_PREFIX } from "@vineyard/shared";

export const healthRouter = Router();

healthRouter.get(`${API_PREFIX}/health`, (_req, res) => {
  res.json({
    status: "ok",
    service: "vineyard-manager-api",
    timestamp: new Date().toISOString(),
  });
});
