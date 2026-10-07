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

### Weekly growing-season digest (Devon, Sage on template)

| Field | Value |
| --- | --- |
| **Owner** | Devon (API/cron/mail) |
| **UI help** | Sage (email template) |
| **QA** | Avery |
| **Status** | Plan approved by Aaron 2026-10-07; build starting |
| **Then** | Morgan runs `Backup-VineyardManager.ps1` after Avery signs off |

**Plan:** Gmail SMTP through the existing nodemailer mailer (moved into a shared mail module). For QA it sends from aingalsbe@gmail.com; a dedicated vineyard Gmail comes later through an env change only. The schedule is Monday 6:30 AM America/Chicago, March through October (`DIGEST_SEASON_MONTHS`), and `DIGEST_CRON_ENABLED=false` until Aaron approves the format. Recipients are active managers/power_users, opt-out per user via `notificationPrefs.weeklyDigest`, and `*.local` addresses are skipped. A `DigestLog` table with a unique index on (vineyard, user, weekStart) prevents double sends.

**Acceptance:**

- [ ] `GET /vineyards/:vid/digest/preview?format=html|text` (manager+) renders tasks (next 7 days plus overdue), weather impacts and health (score plus top 3 reasons), with sensible empty states
- [ ] Task section matches the Dashboard overdue count
- [ ] `POST /vineyards/:vid/digest/send-test` delivers to aingalsbe@gmail.com and reads well in Gmail web and mobile; `to` must be on the `DIGEST_TEST_RECIPIENTS` allowlist; viewers get 403
- [ ] Every send is logged; an SMTP failure returns 502 without crashing the API
- [ ] Cron off by default; re-runs skip duplicates; opted-out, disabled and viewer users are excluded
- [ ] Weather v1 rain check unchanged; no secrets in git or logs

### Small UI follow-up (Sage, alongside the digest)

- Row status badges (Active/Fallow/Replanting) move to blue/neutral so health colors mean health only
- Rows page delete notice wraps extreme labels (`[overflow-wrap:anywhere]`)

---

## Recently shipped (2026-10-07)

- **`9b914db`**: row delete keeps history (soft when the row has history, hard when it doesn't), task delete, partial row `PATCH`, "Removed row" labels
- **`39d1485`**: delete preview that warns about open tasks with Dismiss/Keep, accessible confirm dialogs for row and task delete, removed-row tasks shown in health reasons, plural fixes
- **Polish commit**: RowCard Edit/Delete moved into a ⋯ menu (no sideways scroll at 390px), focus lands on the page heading after a delete, dialog copy uses "work logs" consistently, modal counts match the Tasks page, long-text wrapping in dialogs and cards

---
## Queued after (ordered)

1. **Weather notification prefs** — severe weather, drought/overwater, frost/snow (user-configurable)
2. **Configurable rain threshold** — Setup editor instead of hard-coded 0.5"
3. **Dashboard / Metrics weather-sourced watering** — surface rain-logged Activities in UI/trends
4. **Gate `forceRainInches` for prod** — keep override for local/dev tests only
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