import { schedule, validate, type ScheduledTask } from "node-cron";
import { config } from "../../config.js";
import { runDailyRainCheckForAllVineyards } from "./weather.service.js";

/** 6:15 AM America/Chicago â€” odd minute avoids :00/:30 pile-ups. */
export const DAILY_RAIN_CRON = "15 6 * * *";
export const DAILY_RAIN_CRON_TZ = "America/Chicago";

let scheduledTask: ScheduledTask | null = null;

export function startWeatherScheduler(): ScheduledTask | null {
  if (!config.weatherCronEnabled) {
    console.log("[weather] daily rain cron disabled (WEATHER_CRON_ENABLED=false)");
    return null;
  }

  if (!validate(DAILY_RAIN_CRON)) {
    console.error(`[weather] invalid cron expression: ${DAILY_RAIN_CRON}`);
    return null;
  }

  scheduledTask = schedule(
    DAILY_RAIN_CRON,
    async () => {
      console.log("[weather] daily rain check starting for all vineyards");
      try {
        const results = await runDailyRainCheckForAllVineyards();
        for (const result of results) {
          console.log(
            `[weather] ${result.vineyardName}: ${result.rainInches} in / ${result.thresholdInches} in â†’ ` +
              (result.activityCreated
                ? "created watering activity"
                : result.skippedReason ?? "no action"),
          );
        }
      } catch (error) {
        console.error("[weather] daily rain check run failed", error);
      }
    },
    {
      timezone: DAILY_RAIN_CRON_TZ,
      name: "daily-rain-check",
      noOverlap: true,
    },
  );

  console.log(
    `[weather] daily rain cron scheduled: "${DAILY_RAIN_CRON}" (${DAILY_RAIN_CRON_TZ})`,
  );
  return scheduledTask;
}

export async function stopWeatherScheduler(): Promise<void> {
  if (scheduledTask) {
    await scheduledTask.destroy();
    scheduledTask = null;
  }
}
