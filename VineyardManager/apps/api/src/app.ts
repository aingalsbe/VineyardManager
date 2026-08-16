import cors from "cors";
import express from "express";
import { API_PREFIX } from "@vineyard/shared";
import { config } from "./config.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./modules/health/health.router.js";
import { rowsRouter } from "./modules/rows/rows.router.js";
import { vineyardsRouter } from "./modules/vineyards/vineyards.router.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.webOrigin }));
  app.use(express.json());

  app.use(healthRouter);
  app.use(`${API_PREFIX}/vineyards/:vineyardId/rows`, rowsRouter);
  app.use(`${API_PREFIX}/vineyards`, vineyardsRouter);

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  app.use(errorHandler);
  return app;
}
