import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { API_PREFIX } from "@vineyard/shared";
import { config } from "./config.js";
import { errorHandler } from "./middleware/error-handler.js";
import {
  activitiesRouter,
  vineyardActivitiesRouter,
} from "./modules/activities/activities.router.js";
import { authRouter, publicAuthRouter } from "./modules/auth/auth.router.js";
import {
  requireAuth,
  requireCsrfForCookieMutations,
} from "./modules/auth/auth.middleware.js";
import { vineyardDigestRouter } from "./modules/digest/digest.router.js";
import { harvestsRouter } from "./modules/harvests/harvests.router.js";
import { healthRouter } from "./modules/health/health.router.js";
import { vineyardHealthRouter } from "./modules/health/vineyard-health.router.js";
import { vineyardMetricsRouter } from "./modules/metrics/metrics.router.js";
import { rowsRouter } from "./modules/rows/rows.router.js";
import { vineyardScheduleRouter } from "./modules/schedule/schedule.router.js";
import { vineyardSeasonsRouter } from "./modules/seasons/seasons.router.js";
import { tasksRouter } from "./modules/tasks/tasks.router.js";
import { vineyardUsersRouter } from "./modules/users/users.router.js";
import { vineyardsRouter } from "./modules/vineyards/vineyards.router.js";
import { vineyardWeatherRouter } from "./modules/weather/weather.router.js";

export type CreateAppOptions = {
  rateLimit?: boolean;
};

function makeRateLimiter(options: {
  windowMs: number;
  limit: number;
  message: string;
  skipSuccessfulRequests?: boolean;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: options.message,
        },
      });
    },
  });
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const enableRateLimit = options.rateLimit ?? config.rateLimitEnabled;

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // Cross-origin policies are relaxed for same-origin API + Vite proxy dev setup;
      // route-specific CSP headers are applied on HTML/logo endpoints and in Nginx.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "256kb" }));

  app.use(healthRouter);

  if (enableRateLimit) {
    app.use(
      `${API_PREFIX}/auth/login`,
      makeRateLimiter({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        skipSuccessfulRequests: true,
        message: "Too many sign-in attempts. Try again in 15 minutes.",
      }),
    );
    app.use(
      `${API_PREFIX}/auth/forgot-password`,
      makeRateLimiter({
        windowMs: 60 * 60 * 1000,
        limit: 5,
        message: "Too many password reset requests. Try again later.",
      }),
    );
    app.use(
      `${API_PREFIX}/auth/reset-password`,
      makeRateLimiter({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        message: "Too many password reset attempts. Try again in 15 minutes.",
      }),
    );
    app.use(
      API_PREFIX,
      makeRateLimiter({
        windowMs: 60 * 1000,
        limit: 300,
        message: "Too many requests. Please slow down.",
      }),
    );
  }

  app.use(`${API_PREFIX}/auth`, publicAuthRouter);
  app.use(API_PREFIX, requireAuth, requireCsrfForCookieMutations);
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/harvests`, harvestsRouter);
  app.use(`${API_PREFIX}/activities`, activitiesRouter);
  app.use(`${API_PREFIX}/vineyards/:vineyardId/health`, vineyardHealthRouter);
  app.use(`${API_PREFIX}/vineyards/:vineyardId/metrics`, vineyardMetricsRouter);
  app.use(`${API_PREFIX}/vineyards/:vineyardId/activities`, vineyardActivitiesRouter);
  app.use(`${API_PREFIX}/vineyards/:vineyardId/rows`, rowsRouter);
  app.use(`${API_PREFIX}/vineyards/:vineyardId/tasks`, tasksRouter);
  app.use(`${API_PREFIX}/vineyards/:vineyardId/schedule`, vineyardScheduleRouter);
  app.use(`${API_PREFIX}/vineyards/:vineyardId/seasons`, vineyardSeasonsRouter);
  app.use(`${API_PREFIX}/vineyards/:vineyardId/users`, vineyardUsersRouter);
  app.use(`${API_PREFIX}/vineyards/:vineyardId/weather`, vineyardWeatherRouter);
  app.use(`${API_PREFIX}/vineyards/:vineyardId/digest`, vineyardDigestRouter);
  app.use(`${API_PREFIX}/vineyards`, vineyardsRouter);

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  app.use(errorHandler);
  return app;
}
