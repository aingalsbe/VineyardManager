import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load apps/api/.env before reading process.env. Previously only Prisma loaded
 * it (after this module was evaluated), so SMTP_* / DIGEST_* were never seen.
 * Existing process env vars win (loadEnvFile does not override them).
 */
const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch (error) {
    console.warn("[config] could not load .env", error instanceof Error ? error.message : error);
  }
}

/** "3-10" (inclusive) or "3,4,5" → month numbers 1..12. Invalid → default 3-10. */
export function parseSeasonMonths(value: string | undefined): number[] {
  const fallback = [3, 4, 5, 6, 7, 8, 9, 10];
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  const months = new Set<number>();
  for (const part of raw.split(",")) {
    const range = part.trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start >= 1 && end <= 12 && start <= end) {
        for (let m = start; m <= end; m += 1) months.add(m);
      }
      continue;
    }
    const single = Number(part.trim());
    if (Number.isInteger(single) && single >= 1 && single <= 12) months.add(single);
  }
  return months.size > 0 ? [...months].sort((a, b) => a - b) : fallback;
}

/** Local-dev default only. Set JWT_SECRET in the environment for any real deployment. */
const DEV_JWT_SECRET = "vineyard-dev-jwt-secret-not-for-production";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  /** Local-dev default: apps/api/uploads (gitignored). Set UPLOAD_DIR to override. */
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? "uploads"),
  isProduction: process.env.NODE_ENV === "production",
  appUrl: (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  mailFrom: process.env.MAIL_FROM ?? "Vineyard Manager <noreply@localhost>",
  smtpUrl: process.env.SMTP_URL?.trim() || "",
  smtpHost: process.env.SMTP_HOST?.trim() || "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  /** Port 465 = implicit TLS. */
  smtpSecure: Number(process.env.SMTP_PORT ?? 587) === 465,
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  /** Daily Open-Meteo rain check at 6:15 AM America/Chicago. Set WEATHER_CRON_ENABLED=false to disable. */
  weatherCronEnabled: (process.env.WEATHER_CRON_ENABLED ?? "true").toLowerCase() !== "false",
  /** Weekly digest cron (Mon 6:30 AM America/Chicago). Off unless DIGEST_CRON_ENABLED=true. */
  digestCronEnabled: (process.env.DIGEST_CRON_ENABLED ?? "false").toLowerCase() === "true",
  /** Months the scheduled digest may run (DIGEST_SEASON_MONTHS, default 3-10). */
  digestSeasonMonths: parseSeasonMonths(process.env.DIGEST_SEASON_MONTHS),
  /** Allowlist for POST /digest/send-test (lowercased). Empty = nobody. */
  digestTestRecipients: (process.env.DIGEST_TEST_RECIPIENTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
};
