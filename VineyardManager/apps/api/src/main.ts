import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db/prisma.js";
import {
  startDigestScheduler,
  stopDigestScheduler,
} from "./modules/digest/digest.scheduler.js";
import {
  startWeatherScheduler,
  stopWeatherScheduler,
} from "./modules/weather/weather.scheduler.js";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Vineyard Manager API listening on http://localhost:${config.port}`);
  startWeatherScheduler();
  startDigestScheduler();
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] received ${signal}, shutting down gracefully...`);

  const forceTimer = setTimeout(() => {
    console.error("[api] forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  try {
    await Promise.allSettled([stopWeatherScheduler(), stopDigestScheduler()]);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await prisma.$disconnect();
    clearTimeout(forceTimer);
    process.exit(0);
  } catch (error) {
    console.error("[api] error during shutdown", error);
    clearTimeout(forceTimer);
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
