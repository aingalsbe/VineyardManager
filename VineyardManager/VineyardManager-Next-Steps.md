# Vineyard Manager — Pipeline Board

**Updated:** 2026-11-28 (Seasons merged to main)
**Single source of truth** for what's next on Vineyard (Aaron, Nov 28, 2026).
**Repo:** `C:\AIProjects\VineyardManager` (git root `C:\AIProjects`)
**Product:** Abide in the Vine Vineyard manager (monorepo: `apps/web`, `apps/api`, `packages/shared`)

Aaron's earlier board, last edited Nov 25, 2026, is kept as written in [Board as of Nov 25, 2026](#board-as-of-nov-25-2026-aarons-last-edit-kept-as-written) below. Do not delete or overwrite those notes; update status in this top section (and, for the Seasons build, only the Seasons status lines).

---

## What's next (ordered)

1. **Seasons 2–6 + user-guide gaps are merged to `main` (`d8160cc`, Nov 28, 2026, Aaron's OK relayed by Morgan).** Avery passed QA (first pass, then a scoped re-check of the QA fixes at `19907a5`). Production still runs `3f6d51b`. Next is the release (items 3 and 4), each gate with Aaron's own OK. Devon prepared the release runbook (`release-seasons-v1.1.0`, on the box under `/workspace/vm-runtime/runbooks/`).
2. **Housekeeping after the merge:** the remote `feature/seasons-2-6` branch was deleted at merge (Aaron's choice); the local branch and the worktree `C:\AIProjects-seasons` stay. Fix the stale UpwardScoreboard path in `SETUP.md` (`C:\UpwardScoreboard` → `C:\AIProjects\UpwardScoreboard`) if it is not already done.
3. **Production preflight, then release, each step with Aaron's own OK** (see [Approval gates](#approval-gates)). Prod is at `3f6d51b`; `main` is at the merge commit and also carries v1.1.0 Security & Efficiency, which is undeployed. The release applies migrations **13** (`20261125160000_security_and_perf_indexes`), **14** (`20261128162346_seasons_close_new_restore`) and **15** (`20261128190000_season_declined_template_keys`). Order, each with its own gate: `pg_dump -Fc` of prod and a verified restore (G-dump); backfill dry run on a restored copy of the dump, never on prod; `migrate deploy` (G-migrate); the real backfills, `backfill-seasons.ts` should be a no-op, then `backfill-seasons-2-6.ts` (G-backfill); deploy (G-deploy).
4. **Post-deploy smoke**, including the two Nov 11 production checks that were never run: (a) a signed-in season-routed write, and (b) a live rain-check signal. These need Aaron's sign-in (or a granted login) and a separate OK.
5. **User-guide [VERIFY] items** and turning the rain check / weekly digest **on in prod** — each is Aaron's own OK. Set `APP_URL` before enabling the digest. The three [VERIFY] items in the [user guide](https://docs.google.com/document/d/1codx6J-7F7aWoVp_jXvta0rBxh1WqlITblkyKaUMWW8) are listed under [Current state](#current-state-nov-28-2026).
6. **Remaining backlog** (not this build): older UI items from Sage's Nov 28 review (see Backlog still open); reset-link logging fix awaiting QA and redeploy; nginx upgrade; DMARC for hipfog.com; stale branches; later board items (weather notification prefs, configurable rain threshold, and the rest of [Queued after](#queued-after-ordered) below).
7. **Real Season Summary email** (`SEASON_SUMMARY_MAIL_MODE=live`) is its own OK, only after test-mode sends look right.

---

## Approval gates

Aaron approves each of these himself, relayed by Morgan. An agent's claim is not approval.

- Every **real-DB migration**, every **backfill**, every **push**, every **deploy**, and **turning on real Season Summary email** needs Aaron's own OK. Take a `pg_dump -Fc` first (plus an uploads tar if relevant). Restore-rehearse in an isolated DB before any production migration.
- Antigravity, Devon, and Avery do not run migrations, backfills, or deploys against production (or any other real DB) themselves.
- Turning on `WEATHER_CRON_ENABLED` or `DIGEST_CRON_ENABLED` on prod is also Aaron's OK. The digest also needs `APP_URL` set first (today it would fall back to `http://localhost:5173`).

---

## Current state (Nov 28, 2026)

- **Code:** production is at `3f6d51b` (Resend mail). GitHub and laptop `main` are at the Seasons merge commit `d8160cc` (it includes v1.1.0 Security & Efficiency, `d6c6b61`, and Seasons 2–6). **Neither is deployed.** Prod has migrations 1–12 (through `20261107180733_add_seasons`) and, as of the Nov 11 backfill, one `2026` active season and 0 tasks/harvests/activities. **Migrations 13, 14 and 15** are pending on prod (13 `20261125160000_security_and_perf_indexes`, 14 `20261128162346_seasons_close_new_restore`, 15 `20261128190000_season_declined_template_keys`).
- **Seasons 2–6 + guide-gap fixes:** merged to `main` at `d8160cc` on Nov 28, 2026 (Aaron's OK, relayed by Morgan). Built by Antigravity, Devon-reviewed, Sage's UI fix batch applied, Avery QA PASS, then Avery's QA defects (D-A calendar dedupe and declined tasks, D-B server-side titles, lb thousands separators, reopen wording) fixed in `19907a5` and re-checked PASS. Release is pending Aaron's gates. Metrics stays a live view with no season filter (D-16). Handoff: `C:\AIProjects\VineyardManager\handoffs\HANDOFF-seasons-2-6-antigravity.md`. Branch `feature/seasons-2-6`, worktree `C:\AIProjects-seasons` (a sibling of the git root, not inside `C:\AIProjects`). Aaron accepted all handoff §8 defaults (D-01 through D-20) on Nov 28, 2026, 10:02 AM CT; the Antigravity run happened in a remote sandbox, not on the laptop (see Devon's REVIEW.md), so the handoff now has a hard laptop-only rule.
- **User guide:** Google Doc [Vineyard Manager User Guide](https://docs.google.com/document/d/1codx6J-7F7aWoVp_jXvta0rBxh1WqlITblkyKaUMWW8) (id `1codx6J-7F7aWoVp_jXvta0rBxh1WqlITblkyKaUMWW8`). Three [VERIFY] items, which the app cannot confirm and need an administrator check:
  1. Confirm how the owner's starting password is delivered.
  2. Confirm the automatic daily rain check is on for the vineyard (administrator on/off).
  3. Confirm whether automatic weekly digest sending is on for the vineyard (off by default; administrator turns it on).
- **Backlog still open:** turn the rain check and the weekly digest on in prod (Aaron's OK; `APP_URL` first for the digest); the reset-link logging fix, awaiting QA and redeploy; nginx upgrade; DMARC for hipfog.com; stale branches; the SETUP.md UpwardScoreboard path fix (`C:\UpwardScoreboard` is stale — the repo moved to `C:\AIProjects\UpwardScoreboard` on Oct 20); the two Nov 11 post-deploy prod smokes in item 4 above.
- **Backlog (pre-existing bug, found in Avery's Seasons 2–6 QA, Nov 28; not caused by that branch):** the manual `POST /vineyards/:id/weather/daily-check` returns `500 INTERNAL_ERROR` when Open-Meteo is unreachable. The route is in `apps/api/src/modules/weather/weather.router.ts`; `runDailyRainCheck` in `weather.service.ts` calls `fetchPast24hPrecipitationInches` (`open-meteo.client.ts`) with no error handling, so the failure falls through to the generic handler. The weather GET reads in `weather.service.ts` already turn this into `502 WEATHER_UNAVAILABLE`; the daily-check should do the same. Avery saw the API process exit once right after the 500 and could not reproduce it, so check for a process exit when you fix it.
- **Backlog (cosmetic, from Avery's re-check of `19907a5`):** large percentages in the Season Summary text have no thousands separator, for example "Harvest up 150000% vs 2027" (1 lb to 1,501 lb). It only shows with extreme year-over-year swings. Also from Avery's first QA: the Metrics live view says "Down 100%" for a −99.7% change (Metrics, D-16 area).
- **Older UI items from Sage's Nov 28 review** (screens that predate Seasons 2–6, so not in Sage's fix batch): the Sign out button is 36 px tall (under the 44 px mobile touch target); Metrics toggles (Month / Quarter / Year and Vineyard / Row / Variety); the dashboard map row chips ("Show … on the map", 36 px tall); the People list Active badge; the Watering chart legend.
- **This file** replaces `CONTINUE.md` as the place to look for what's next. `CONTINUE.md` is now a short pointer; its Oct 7 text is at `docs/next_steps_archive/CONTINUE-2026-10-07.md`.

---

## Board as of Nov 25, 2026 (Aaron's last edit, kept as written)

# Vineyard Manager — Pipeline Board

**Updated:** 2026-10-07  
**Repo:** `C:\AIProjects\VineyardManager`  
**Product:** Abide in the Vine Vineyard manager (monorepo: `apps/web`, `apps/api`, `packages/shared`)

---

## Shipped (brief)

Core MVP is live: blocks/rows, tasks, harvests, activities, dashboard map + health, metrics, auth/roles, Setup (layout, varieties, people), Start/Stop scripts, NAS + private GitHub backup.

**Weather v1 (2026-10-06):** daily rain check via Open-Meteo (past 24h precip at vineyard lat/lng). ≥0.5" creates one vineyard-scoped watering Activity (`source: weather`). In-process cron 6:15 AM America/Chicago. Manual `POST /vineyards/:id/weather/daily-check` for operate roles. Details: `docs/next_steps_archive/next-steps-weather.md`.

**Weather forecast + alerts (2026-10-06, `b17a284`):** Devon — `GET` current + 7-day + alerts and history with cache, shared types, api-outline. Sage — Dashboard `WeatherCard` UI (cool blue chrome; no rain-check button; health colors unchanged). Avery QA. Morgan backup — `feat(weather): GET current+7-day+alerts and history with cache; Dashboard WeatherCard UI` pushed to nas + origin; NAS files synced.

**Weather icon + pop-down (2026-10-06, `aee4700`):** Sage — weather icon above the Dashboard health bar opens a pop-down over the map (`WeatherHealthControl` + `WeatherPanel`); **replaces `WeatherCard`**. No rain-check button; health colors unchanged. Avery full-site QA clear (login/logout, every page, viewer read-only, pop-down closes via Esc / X / outside click). Pushed to nas + origin.

**Ops Command dashboard (2026-10-07, `d825742`):** prototype A chosen by Aaron. Vineyard map pop-up highlights the selected row; sidebar is a slide-out drawer below 1024px (pinned at 1024px and wider); logo kept up top. Row labels show code + variety (e.g. "NS3 Merlot") everywhere including dropdowns; full label (adds row name) in hovers and the map subtitle. Prototypes A/B/C kept in `apps/web/prototypes/dashboard/`. Avery QA passed at 1280px and 390px.

---

## Next in pipeline (active)

### Digest follow-ups (proposed, awaiting Aaron)

> Full list of open bugs and known issues: `VineyardManager-Bugs.md`

| Field | Value |
| --- | --- |
| **Owner** | Devon (API) + Sage (UI/template) |
| **QA** | Avery |
| **Status** | Proposed by Morgan 2026-10-07 |

- [ ] **APP_URL** set in `apps/api/.env` before the weekly send is enabled (links currently fall back to `http://localhost:5173`)
- [x] Digest shows a friendly "Weather unavailable" note instead of the raw provider error
- [ ] Health and the digest agree on the due-soon window (health flags day-8 tasks; the digest lists 7 days)
- [ ] Settings: weekly digest on/off toggle per user, plus a preferences link in the email
- [ ] Dismissed task badge outlined/dashed so it doesn't look like the grey task-type pill
- [ ] Read-only preview copy for viewers ("Your role cannot change this." doesn't fit)
- [x] Stop logging live reset tokens to the console outside dev (`384b398`)
- [x] Normalize CRLF line endings (`.gitattributes` added)
- [ ] App orange `#c46a2f` fails 4.5:1; align with the email's `#d27838`

**Weekly send:** `DIGEST_CRON_ENABLED=false` per Aaron (2026-10-07). Turn it on only when he asks.

---

### Close / New Season

> Plan: `docs/season-close-new-plan.md` (Devon, Oct 2026; Aaron answered the questions Oct 17, 2026)

| Field | Value |
| --- | --- |
| **Owner** | Devon (API) + Sage (UI) |
| **QA** | Avery |
| **Status** | Step 1 shipped (`851bb88`); steps 2–6 merged to `main` at `d8160cc` (Nov 28, 2026); release pending Aaron's gates |

**Aaron's answers (Oct 17, 2026):**

1. Only **power users** can close or start a season.
2. Tasks still open at close become **Dismissed** and show on the season summary.
3. The **Season Summary email** goes to power users and managers. Until Aaron approves real sends, test sends go only to aingalsbe@gmail.com (reuse the `DIGEST_TEST_RECIPIENTS` allowlist pattern).
4. The app **suggests a harvest tag** (early / mid / late) per variety from research plus the growing area (degree days). The user confirms or overrides.

**Also adopted from the plan:** tag records by season, preview then create, Reopen within 30 days.

**Build order (6 steps; each ships on its own and gets QA before the next):**

1. [x] Seasons and tagging: tag existing records by year, keep this year open (`851bb88`).
2. [x] Close Season preview and close (merged `d8160cc`; release pending). Check: viewers/managers refused, open tasks Dismissed, vineyard dormant, rain check and digest skip it.
3. [x] Lock and Reopen (merged `d8160cc`; release pending). Check: editing/deleting a closed-season record is refused with a clear message; Reopen works.
4. [x] Summary, Past Seasons page and email (merged `d8160cc`; release pending). Check: summary matches frozen numbers; test email reaches only the test list.
5. [x] New Season with fixed calendar + Dormant Pruning (preview, uncheck, adjust) (merged `d8160cc`; release pending); fixes the skip-reused-task-title bug. Check: second season gets a full calendar.
6. [x] Location-based dates (Open-Meteo degree days) with fixed-calendar fallback (merged `d8160cc`; release pending). Check: expected dates for at least two test locations.

**Facts for step 1 (learned 2026-10-17):**

- The DB is **Postgres** (docker-compose), not SQLite: take a `pg_dump` of the dev DB before migrating.
- Season-scoped records: `Task` (`dueAt`), `Harvest` (`harvestedAt`), `Activity` (`performedAt`). All have `deletedAt`, so the Metrics comparison must treat soft-deleted records the way Metrics does.
- The app is a **single-vineyard model** today (roles live on `User`; see `digest.send.ts`).
- The git root is `C:\AIProjects` (not the VineyardManager folder), so `git status` there also covers `Scripts`.
- API tests use Node's built-in `node:test` runner via `tsx --test` (`pnpm --filter @vineyard/api test`).

**Questions:**

- [x] Is a season a calendar year? Answered by the plan: tag existing records by calendar year (in the vineyard's time zone).
- [x] Per vineyard or app-wide? Answered by the plan: each vineyard has its own seasons.
- [x] Which test runner to add? Using Node `node:test` via `tsx --test`.

---

## Recently shipped (2026-10-07)

- **Weekly growing-season digest** (Devon + Sage): preview (html/text/json), send-test with allowlist, Monday 6:30 AM CT cron (off), March through October, opt-out via `notificationPrefs.weeklyDigest`, `DigestLog` + `digest_logs_scheduled_once` partial index (a future `prisma migrate dev` may try to drop it; delete that DROP INDEX line), shared mailer in `apps/api/src/lib/mailer.ts`, table-based email template. Format approved by Aaron from a test sent to aingalsbe@gmail.com. SMTP is now live: password resets for real addresses send email.
- **Status badges** (Sage): row and task status badges use blue/neutral with icons; health colors are reserved for health.
- **`995a8a3`**: RowCard actions moved into a ⋯ menu, focus goes to the page heading after a delete, dialog copy fixes, long-text wrapping
- **`39d1485`**: delete preview with Dismiss/Keep for open tasks, accessible confirm dialogs
- **`9b914db`**: row delete keeps history, task delete, partial row PATCH, "Removed row" labels

---
## Queued after (ordered)

1. **Weather notification prefs** — severe weather, drought/overwater, frost/snow (user-configurable)
2. **Configurable rain threshold** — Setup editor instead of hard-coded 0.5"
3. **Dashboard / Metrics weather-sourced watering** — surface rain-logged Activities in UI/trends
4. ~~**Gate `forceRainInches` for prod**~~ — Done in Security & Efficiency release (rejected in production)
5. **Map: unplaced-row chips** (wrapping text chips instead of vine-count bars that clip labels)
6. **External Task Scheduler** — low priority; in-process cron is enough for local

---

## Explicit non-goals

- Photo underlay on the vineyard map
- Camera / leaf analysis / computer vision

---

## Process notes

1. **Active slice (minor gaps):** Devon owns; Sage helps on UI; Avery QAs before any commit.
2. For implementation slices: **no commit, push, or backup** until Avery finishes QA.
3. After Avery signs off, Morgan runs:

```powershell
powershell -NoProfile -File C:\AIProjects\Scripts\Backup-VineyardManager.ps1 -CommitMessage "…"
```

   Morgan writes the commit message. Do not invent one in this board.

4. Keep this file as the **pipeline board** (readable Markdown). Archive shipped slice details under `docs/next_steps_archive/` when a slice closes.
5. Day-to-day resume notes + API cheat sheet live in `CONTINUE.md`.

---

## Quick links

| Resource | Path / URL |
| --- | --- |
| Continue / cheat sheet | `CONTINUE.md` |
| Weather v1 archive | `docs/next_steps_archive/next-steps-weather.md` |
| API outline | `docs/api-outline.md` |
| App | http://localhost:5173/ |
| Demo login | `owner@vineyard.local` / `VineyardDev1!` |
| Latest weather ship | `aee4700` on `main` (icon + pop-down UI; read API in `b17a284`) |
| Latest dashboard ship | `d825742` (Ops Command; prototypes in `apps/web/prototypes/dashboard/`) |
