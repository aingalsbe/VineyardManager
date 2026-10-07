import { schedule, validate, type ScheduledTask } from "node-cron";
import { config } from "../../config.js";
import { runScheduledDigestForAllVineyards } from "./digest.send.js";

/** Mondays 6:30 AM America/Chicago. */
export const WEEKLY_DIGEST_CRON = "30 6 * * 1";
export const WEEKLY_DIGEST_CRON_TZ = "America/Chicago";

let scheduledTask: ScheduledTask | null = null;

function currentMonthInZone(timeZone: string, now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric" }).format(now),
  );
}

export function startDigestScheduler(): ScheduledTask | null {
  if (!config.digestCronEnabled) {
    console.log("[digest] weekly digest cron disabled (DIGEST_CRON_ENABLED is not true)");
    return null;
  }

  if (!validate(WEEKLY_DIGEST_CRON)) {
    console.error(`[digest] invalid cron expression: ${WEEKLY_DIGEST_CRON}`);
    return null;
  }

  scheduledTask = schedule(
    WEEKLY_DIGEST_CRON,
    async () => {
      const month = currentMonthInZone(WEEKLY_DIGEST_CRON_TZ);
      if (!config.digestSeasonMonths.includes(month)) {
        console.log(`[digest] month ${month} outside DIGEST_SEASON_MONTHS; skipping weekly digest`);
        return;
      }
      console.log("[digest] weekly digest starting for all vineyards");
      try {
        const results = await runScheduledDigestForAllVineyards();
        for (const r of results) {
          console.log(
            `[digest] ${r.vineyardName} week ${r.weekStart}: sent ${r.sent}, failed ${r.failed}, ` +
              `skipped ${r.skipped}, already logged ${r.alreadyLogged}, opted out ${r.optedOut}`,
          );
        }
      } catch (error) {
        console.error("[digest] weekly digest run failed", error);
      }
    },
    {
      timezone: WEEKLY_DIGEST_CRON_TZ,
      name: "weekly-digest",
      noOverlap: true,
    },
  );

  console.log(
    `[digest] weekly digest cron scheduled: "${WEEKLY_DIGEST_CRON}" (${WEEKLY_DIGEST_CRON_TZ}), ` +
      `season months ${config.digestSeasonMonths.join(",")}`,
  );
  return scheduledTask;
}

export async function stopDigestScheduler(): Promise<void> {
  if (scheduledTask) {
    await scheduledTask.destroy();
    scheduledTask = null;
  }
}
