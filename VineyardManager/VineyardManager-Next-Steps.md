# Vineyard Manager — Pipeline Board

**Updated:** 2026-10-06  
**Repo:** `C:\AIProjects\VineyardManager`  
**Product:** Abide in the Vine Vineyard manager (monorepo: `apps/web`, `apps/api`, `packages/shared`)

---

## Shipped (brief)

Core MVP is live: blocks/rows, tasks, harvests, activities, dashboard map + health, metrics, auth/roles, Setup (layout, varieties, people), Start/Stop scripts, NAS + private GitHub backup.

**Weather v1 (2026-10-06):** daily rain check via Open-Meteo (past 24h precip at vineyard lat/lng). ≥0.5" creates one vineyard-scoped watering Activity (`source: weather`). In-process cron 6:15 AM America/Chicago. Manual `POST /vineyards/:id/weather/daily-check` for operate roles. Details: `docs/next_steps_archive/next-steps-weather.md`.

**Weather forecast + alerts (2026-10-06, `b17a284`):** Devon — `GET` current + 7-day + alerts and history with cache, shared types, api-outline. Sage — Dashboard `WeatherCard` UI (cool blue chrome; no rain-check button; health colors unchanged). Avery QA. Morgan backup — `feat(weather): GET current+7-day+alerts and history with cache; Dashboard WeatherCard UI` pushed to nas + origin; NAS files synced.

---

## Next in pipeline (active)

### Dashboard redesign prototypes (Sage)

| Field | Value |
| --- | --- |
| **Owner** | Sage (UI/UX) |
| **Constraint** | **No live Dashboard code changes** until Aaron picks a direction |
| **Then** | Avery QA (when a chosen design is implemented later); Morgan runs `Backup-VineyardManager.ps1` |
| **Approved by** | Aaron |

**Goal:** Review the current Dashboard and deliver **alternate prototypes** using modern UI/UX practices. Prototypes only — not merged into the live app until Aaron chooses.

**Acceptance (this slice):**

- [ ] Review current Dashboard layout and UX
- [ ] Deliver alternate prototype(s) (modern UI/UX; cool blue chrome; preserve health color semantics)
- [ ] Document tradeoffs so Aaron can pick a direction
- [ ] No live code changes / no commit of Dashboard redesign until Aaron picks

**Out of scope for this slice:**

- Implementing the chosen design in production code (separate slice after Aaron picks)
- Weather notification prefs, thresholds, digests (see Queued)
- Photo underlay; camera or leaf analysis

---

## Queued after (ordered)

1. **Weather notification prefs** — severe weather, drought/overwater, frost/snow (user-configurable)
2. **Configurable rain threshold** — Setup editor instead of hard-coded 0.5"
3. **Weekly growing-season digest** — summary notifications during the season
4. **Dashboard / Metrics weather-sourced watering** — surface rain-logged Activities in UI/trends
5. **Gate `forceRainInches` for prod** — keep override for local/dev tests only
6. **External Task Scheduler** — low priority; in-process cron is enough for local

---

## Explicit non-goals

- Photo underlay on the vineyard map
- Camera / leaf analysis / computer vision

---

## Process notes

1. **Active slice (prototypes):** Sage delivers prototypes only — **no live Dashboard changes** until Aaron picks.
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
| Latest weather ship | `b17a284` on `main` |