# Continue Here — Vineyard Manager

## Last Completed
- Monorepo set up with pnpm + Turborepo (apps/web, apps/api, packages/shared)
- Prisma schema + migration applied (users, vineyards, rows, tasks, harvests, activities)
- Postgres running via Docker
- Seed data loaded and verified
- Rows page connected to the API (create/edit)
- Tasks: list (filter by row/status), create, edit, mark complete / change status
- Harvest logging: first-class Harvest model, record yield against a row, harvest history at /harvests
- Dashboard: summary stats, upcoming/overdue tasks, recent harvests, quick actions
- Activities / Log work: list + create (vineyard or row scope), filters, persist in Postgres
- Auth: email + password login, JWT on `/api/v1` (except health + login), gated UI, `performedBy` on new activities
- Health colors v1: schematic map + scores on Dashboard, chips on Rows; inventory stats moved to Setup
- Vineyard create/edit on Setup; logo upload shown in the top header on every signed-in page
- Setup row layout editor; Vineyard.rowLayout saved; bar length from vineCount; Dashboard uses saved positions + health colors; seed vineyard named Abide in the Vine Vineyard
- 4 N–S rows at 23 vines / 161', 11 E–W rows at 10 vines / 70'; dashboard map scales to show every row with no scroll
- Dashboard map bars open a row action panel; complete overdue task or log watering/pest/weed against that row; health reloads after save
- Setup varieties catalog, calendar seed, and health cutoff editor
- Seed + default layout use NS1–NS4 / EW1–EW11 (L/S codes rename in place on re-seed)
- UI chrome is cool blue (buttons, nav, surfaces); health overlay stays green / yellow / orange / red
- Header shows a larger logo only (vineyard name is not beside it); Dashboard pins vineyard health + map above the work lists
- Metrics page: health / harvest / activity trends (month, quarter, year); variety rollups sum rows that share a grape; 4-year seed history
- Role checks on writes: viewer is read-only; manager operates (work, harvest, tasks, rows); power_user also does Setup. JWT 403 FORBIDDEN
- Power users invite / change role / disable people from Setup (`GET/POST/PATCH/DELETE /vineyards/:id/users`). Temp password shown once. No email yet.
- Settings edits name + email; logged-in change-password; forgot/reset via email link (`devResetUrl` when SMTP is off).
- Start-VineyardManager.ps1 and Stop-VineyardManager.ps1 scripts working
- Project backed up to NAS + private GitHub repo

- **Weather v1 daily rain check (shipped 2026-10-06):** Open-Meteo past-24h precip at vineyard lat/lng (geocode+persist address if missing); ≥0.5 in creates one vineyard-scoped watering Activity (source weather); in-process cron 6:15 AM America/Chicago; POST /vineyards/:id/weather/daily-check for operate roles; no Dashboard button. Archive: `docs/next_steps_archive/next-steps-weather.md`

- **Weather GET + WeatherCard (shipped 2026-10-06, `b17a284`):** Devon — GET current + 7-day + alerts and history with cache, shared types, api-outline. Sage — Dashboard WeatherCard UI. Avery QA. Morgan backup: `feat(weather): GET current+7-day+alerts and history with cache; Dashboard WeatherCard UI` (pushed nas + origin; NAS synced).

- **Weather icon + pop-down (shipped 2026-10-06, `aee4700`):** Sage — weather icon above the Dashboard health bar opens a pop-down over the map (`WeatherHealthControl` + `WeatherPanel`); replaces `WeatherCard`. No rain-check button; health colors unchanged. Avery full-site QA clear. Pushed nas + origin.

- **Ops Command dashboard (shipped 2026-10-07, `d825742`):** prototype A chosen by Aaron. Map pop-up highlights the selected row; slide-out sidebar drawer below 1024px (pinned at 1024px+); logo kept up top; row labels are code + variety (e.g. "NS3 Merlot") everywhere incl. dropdowns, full label (adds row name) in hovers and the map subtitle. Prototypes A/B/C in `apps/web/prototypes/dashboard/`. Avery QA passed at 1280px and 390px.

## Next Priority
- **Active:** Minor-gaps slice (owner Devon, UI help Sage, QA Avery) — history-safe row delete; task delete (manager+, confirm); partial row `PATCH`; tasks on deleted rows show "Removed row" instead of raw codes like `NS1__old_xxx`.
- **Next after that:** Weekly growing-season digest (maintenance + weather impacts + health summary) — needs email sending / SMTP.
- Pipeline board: `VineyardManager-Next-Steps.md` (queued weather follow-ons: notification prefs, configurable rain threshold, Dashboard/Metrics watering surfacing, gate forceRainInches, external Task Scheduler).
- Non-goals: photo underlay; camera/leaf analysis.
## Notes
- Working directory: C:\AIProjects\VineyardManager
- Use the existing Start/Stop scripts when resuming
- Demo login: owner@vineyard.local / VineyardDev1! (manager@ and viewer@ use the same password)
- Dashboard: http://localhost:5173/
- Rows: http://localhost:5173/rows
- Tasks: http://localhost:5173/tasks
- Harvests: http://localhost:5173/harvests
- Log work: http://localhost:5173/activities
- Activity API: GET/POST /api/v1/vineyards/:id/activities ; GET/DELETE /api/v1/activities/:id
- Auth API: POST /api/v1/auth/login, POST /api/v1/auth/logout, GET/PATCH /api/v1/auth/me, POST /api/v1/auth/change-password, POST /api/v1/auth/forgot-password, POST /api/v1/auth/reset-password (disabled/deleted users cannot log in or use an old token)
- Mail: optional `SMTP_URL` or `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`, `MAIL_FROM`, `APP_URL`. Local reset works without mail (`devResetUrl` in development).
- People API: GET/POST/PATCH/DELETE /api/v1/vineyards/:id/users (power_user). POST returns `{ user, temporaryPassword }` once.
- Health API: GET /api/v1/vineyards/:id/health
- Weather API (shipped): POST /api/v1/vineyards/:id/weather/daily-check (operate). Cron 6:15 AM America/Chicago; WEATHER_CRON_ENABLED
- Weather API (shipped `b17a284`): GET /api/v1/vineyards/:id/weather — current + 7-day + alerts (cached); GET history; Dashboard UI is the weather icon + pop-down (`aee4700`, replaced WeatherCard)
- Vineyard API: POST/PATCH /api/v1/vineyards (including `rowLayout`), PUT/GET/DELETE /api/v1/vineyards/:id/logo
- Setup: http://localhost:5173/setup
- Metrics: http://localhost:5173/metrics
- Metrics API: GET /api/v1/vineyards/:id/metrics?period=month|quarter|year
- Harvest type on Log work is a note only — yield still lives on Harvests
- Process: no commit/push until Avery QA on implementation slices; then `powershell -NoProfile -File C:\AIProjects\Scripts\Backup-VineyardManager.ps1 -CommitMessage "…"` (Morgan writes message).