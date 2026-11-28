# Seasons 2–6 Post-Deploy Smoke Checklist

Run this checklist **after** Aaron approves the production backup, migrations, backfill, and deploy. Do not run against production without explicit sign-in and approval.

## 0. Preflight & backup (before deploy)

1. Read-only migration history check on prod: confirm whether migration `20261125160000_security_and_perf_indexes` (v1.1.0) is already applied, or if the Seasons 2–6 deploy will apply both migration 13 and migration 14 (`20261128162346_seasons_close_new_restore`).
2. Take a full `pg_dump -Fc` + uploads archive, record SHA-256 hashes, copy off-droplet, and rehearse restore into an isolated local DB.
3. Verify `SEASON_SUMMARY_MAIL_MODE=test` (default) and `DIGEST_TEST_RECIPIENTS` are set in production env until Aaron explicitly approves `SEASON_SUMMARY_MAIL_MODE=live`.
4. After `prisma migrate deploy`, confirm all 6 hand-written partial indexes exist in `pg_indexes`:
   - `activities_vineyard_type_perf_live_idx` (`activities`)
   - `digest_logs_scheduled_once` (`digest_logs`)
   - `seasons_one_active_per_vineyard` (`seasons`)
   - `seasons_one_planned_per_vineyard` (`seasons`)
   - `tasks_season_template_key_live_unique` (`tasks`)
   - `tasks_vineyard_status_due_live_idx` (`tasks`)
5. Run dry-runs before any apply:
   - `backfill-seasons.ts` dry run (expect no-op / 0 untagged).
   - `backfill-seasons-2-6.ts` dry run; apply only if counts reconcile, then re-run to confirm no-op.

## 1. Carry-over Nov 11 smoke checks (G6 — never run on prod)

These two checks from the Nov 11 Seasons Step 1 release were deferred and must be executed with an authenticated sign-in after deploy:

1. **Nov 11 Check #2 — Authenticated season-routed write:**
   - Sign in as an operate user (power user or manager).
   - Create a temporary test task (or activity), verify its `seasonId` matches the active season, then soft-delete the test record so production data stays clean.
2. **Nov 11 Check #3 — Live rain-check signal:**
   - Confirm the 6:15 AM CT daily rain-check cron ran cleanly in container logs (or trigger `POST /api/v1/vineyards/:id/weather/daily-check` without `forceRainInches`) and verify Open-Meteo responds without unhandled errors and skips dormant vineyards.

## 2. Seasons 2–6 & user-guide smoke checks

1. **Read-only checks (viewer + manager + power user):**
   - `GET /api/v1/vineyards/:id/seasons` and `GET /api/v1/vineyards/:id/seasons/current` return 200.
   - `/seasons` (Past seasons) loads cleanly from Setup → Season card.
   - Manager sees NO "Set up vineyard" button on Dashboard; Setup remains read-only.
   - Viewer sees `"Viewers don't receive the weekly digest."` on Settings → Notifications.
2. **Role enforcement (403 checks):**
   - Confirm manager/viewer receive `403 FORBIDDEN` on `close-preview`, `close`, `reopen`, `new-preview`, and `new`.
3. **Notification preferences:**
   - Toggle "Weekly digest email" on Settings → Notifications (`PATCH /api/v1/auth/me/notification-prefs`), reload page, confirm persisted, then restore original preference.
4. **Work log & harvest edit/delete/restore:**
   - Confirm Edit/Delete/Recently removed/Restore work on a test record in the active season, then clean up.
5. **Season lifecycle (when ready for real end-of-season close):**
   - Preview Close Season → verify open tasks list, harvest/work counts, and mid-season warning if applicable.
   - Close Season → confirm vineyard enters Dormant state, closed records show read-only "Closed season" badge, and Season Summary email lands only on the allowlisted test address while `SEASON_SUMMARY_MAIL_MODE=test`.
   - Confirm Reopen button shows 30-day countdown and Start New Season preview loads location-based (or fixed-fallback) dates with Dormant Pruning first.
