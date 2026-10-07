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

| Field | Value |
| --- | --- |
| **Owner** | Devon (API) + Sage (UI/template) |
| **QA** | Avery |
| **Status** | Proposed by Morgan 2026-10-07 |

- [ ] **APP_URL** set in `apps/api/.env` before the weekly send is enabled (links currently fall back to `http://localhost:5173`)
- [ ] Digest shows a friendly "Weather unavailable" note instead of the raw provider error
- [ ] Health and the digest agree on the due-soon window (health flags day-8 tasks; the digest lists 7 days)
- [ ] Settings: weekly digest on/off toggle per user, plus a preferences link in the email
- [ ] Dismissed task badge outlined/dashed so it doesn't look like the grey task-type pill
- [ ] Read-only preview copy for viewers ("Your role cannot change this." doesn't fit)
- [ ] Stop logging live reset tokens to the console outside dev
- [ ] Normalize CRLF line endings (app.ts, main.ts, vineyard-health.router.ts, .env.example)
- [ ] App orange `#c46a2f` fails 4.5:1; align with the email's `#d27838`

**Weekly send:** `DIGEST_CRON_ENABLED=false` per Aaron (2026-10-07). Turn it on only when he asks.

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