# Vineyard Manager — Pipeline Board

**Updated:** 2026-10-06  
**Repo:** `C:\AIProjects\VineyardManager`  
**Product:** Abide in the Vine Vineyard manager (monorepo: `apps/web`, `apps/api`, `packages/shared`)

---

## Shipped (brief)

Core MVP is live: blocks/rows, tasks, harvests, activities, dashboard map + health, metrics, auth/roles, Setup (layout, varieties, people), Start/Stop scripts, NAS + private GitHub backup.

**Weather v1 (2026-10-06):** daily rain check via Open-Meteo (past 24h precip at vineyard lat/lng). ≥0.5" creates one vineyard-scoped watering Activity (`source: weather`). In-process cron 6:15 AM America/Chicago. Manual `POST /vineyards/:id/weather/daily-check` for operate roles. Details: `docs/next_steps_archive/next-steps-weather.md`.

---

## Next in pipeline (active)

### GET current + 7-day forecast + alerts (API + light UI)

| Field | Value |
| --- | --- |
| **API** | Devon (Sr Dev) — GET weather, history, cache, shared types, api-outline |
| **UI** | Sage (UI/UX) — light UI; modern practices; cool blue chrome; no rain-check button; health colors unchanged |
| **QA** | Avery — after both Devon and Sage are ready |
| **Then** | Morgan runs `Backup-VineyardManager.ps1` (writes commit message) |
| **Approved by** | Aaron |

**Goal:** Expose current conditions, a 7-day forecast, and weather alerts for a vineyard, plus a light UI so operators can see them without leaving the app.

**Acceptance (matches Morgan's brief):**

- [ ] `GET /api/v1/vineyards/:id/weather` returns **current** conditions, **7-day** forecast, and **alerts** (cached), keyed off vineyard `lat`/`lng` (same location rules as Weather v1)
- [ ] Auth: signed-in vineyard member with read access (not operate-only)
- [ ] Light UI surfaces current + 7-day + alerts (no heavy redesign; Dashboard or a small weather panel is fine)
- [ ] Reuses Open-Meteo client patterns already in `apps/api/src/modules/weather/`
- [ ] Daily rain check / cron behavior unchanged
- [ ] Avery QA pass (after Devon API + Sage UI) before any commit/push/backup

**Out of scope for this slice:**

- Weather notification prefs (severe, drought/overwater, frost/snow)
- Configurable rain threshold in Setup
- Weekly growing-season digest
- Dashboard/Metrics surfacing of weather-sourced watering Activities
- Gating `forceRainInches` for production
- External Windows Task Scheduler / service-account cron
- Photo underlay; camera or leaf analysis

---

## Queued after (ordered)

1. **Dashboard redesign prototypes (Sage)** — After forecast+alerts ships: review current Dashboard and deliver alternate prototypes (modern UI/UX). No live code changes until Aaron picks a direction.
2. **Weather notification prefs** — severe weather, drought/overwater, frost/snow (user-configurable)
3. **Configurable rain threshold** — Setup editor instead of hard-coded 0.5"
4. **Weekly growing-season digest** — summary notifications during the season
5. **Dashboard / Metrics weather-sourced watering** — surface rain-logged Activities in UI/trends
6. **Gate `forceRainInches` for prod** — keep override for local/dev tests only
7. **External Task Scheduler** — low priority; in-process cron is enough for local

---

## Explicit non-goals

- Photo underlay on the vineyard map
- Camera / leaf analysis / computer vision

---

## Process notes

1. **No commit, push, or backup** until Avery finishes QA on the active slice.
2. After Avery signs off, Morgan runs:

```powershell
powershell -NoProfile -File C:\AIProjects\Scripts\Backup-VineyardManager.ps1 -CommitMessage "…"
```

   Morgan writes the commit message. Do not invent one in this board.

3. Keep this file as the **pipeline board** (readable Markdown). Archive shipped slice details under `docs/next_steps_archive/` when a slice closes.
4. Day-to-day resume notes + API cheat sheet live in `CONTINUE.md`.

---

## Quick links

| Resource | Path / URL |
| --- | --- |
| Continue / cheat sheet | `CONTINUE.md` |
| Weather v1 archive | `docs/next_steps_archive/next-steps-weather.md` |
| API outline | `docs/api-outline.md` |
| App | http://localhost:5173/ |
| Demo login | `owner@vineyard.local` / `VineyardDev1!` |