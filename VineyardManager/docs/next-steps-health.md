# Health colors v1 — Grok Build prompt

Load this whole file into Grok Build (agent / multi-file) **after** Auth is reviewed and committed.

Do not use `VineyardManager-Next-Steps.md`. Living status still lives in repo `CONTINUE.md` and `docs/next-steps.md` (Auth slice).

**Last updated:** 2026-08-24  
**Depends on:** Auth slice may already be on disk. Adapt; do not revert it.  
**Repo:** https://github.com/aingalsbe/VineyardManager

---

Wire Health colors v1, a schematic vineyard health map, and clean up Dashboard / Setup.

Read AGENTS.md first and follow it strictly. Small, focused diff. One feature slice only. Do not rewrite the monorepo.

Auth may have just landed (login, JWT Bearer, gated /api/v1). Adapt to whatever is on disk. Do not revert Auth. Do not expand Auth (no RBAC matrix, no password reset).

==================================================
CURRENT STATE (do not invent a different architecture)
==================================================
- Monorepo: apps/web (React + Vite + Tailwind), apps/api (Express + Prisma), packages/shared.
- Live pages: Dashboard `/`, Rows `/rows`, Tasks `/tasks`, Harvests `/harvests`, Activities `/activities`, Setup `/setup`, Settings `/settings`.
- DashboardPage.tsx current order:
    1. PageHeader
    2. StatCard grid: Active rows, Total length, Vines  (summarizeRows)
    3. Quick actions
    4. Upcoming tasks (5)
    5. Recent harvests (5)
    6. Placeholder "map / health scoring not implemented" card
    7. HealthLegend
- SetupPage.tsx is four static step cards (Varieties, Map rows, Calendar, Health colors). No stats, no API hooks.
- Rows are cards via RowCard.tsx (code, name, variety, status badge, length, vines, planted). No health color.
- apps/web/src/lib/health.ts is display-only (swatch, range label, meaning). No scoring function.
- HealthLegend.tsx already renders green/yellow/orange/red with HEALTH_SCORE_DEFAULTS.
- Prisma Vineyard.healthThresholds Json: { greenMin, yellowMin, orangeMin } (seed: 80 / 70 / 60).
- Vineyard has address + lat/lng (Cedar Ridge: 38.7432, -94.8251). Rows do NOT have lat/lng, GeoJSON, sort_order, or geometry.
- NO HealthSnapshot table. Do not add one this slice.
- Data already in Postgres via seed: 6 rows (L1, L2, S1, S2, S3, L3), open/overdue tasks, harvests, a few activities including a vineyard-scoped watering on 2026-08-10.
- Shared already has HEALTH_COLORS, HEALTH_SCORE_DEFAULTS, healthThresholdsSchema.
- API style: feature modules, Zod, HttpError, { data } / { error: { code, message } }.
- Web does NOT use TanStack Query. Match existing hooks (useVineyardRows, useVineyardTasks, useHarvests) and PageHeader / Card / Button / Badge.
- Product language: Vineyard → Row. Activities are the write path. Health colors explain WHY a row needs attention.

==================================================
GOAL
==================================================
A grower opens the dashboard and immediately sees a schematic of the vineyard with rows colored green / yellow / orange / red, plus why. Inventory numbers live on Setup. Logging work or completing a task can change a row’s color on the next load.

==================================================
REQUIREMENTS
==================================================

1) Shared scoring (packages/shared)
   Add a pure function, e.g. scoreRowHealth(...) + scoreVineyardHealth(...).
   Deterministic. No I/O. Inject `asOf: Date` so it is testable.

   Inputs per vineyard:
   - rows
   - tasks
   - activities
   - healthThresholds (fall back to HEALTH_SCORE_DEFAULTS)
   - asOf

   Output:
   - vineyard: { score, color, reasons[] }
   - rows: Array<{ rowId, code?, score, color, reasons: Array<{ code: string, message: string }> }>

   Color banding (inclusive floors):
   - score >= greenMin  → green
   - score >= yellowMin → yellow
   - score >= orangeMin → orange
   - else               → red

   Scoring rules (start each active row at 100, floor at 0):

   Status caps (apply after penalties, as a ceiling):
   - retired     → include it, color green, score 100, single reason "Row is retired — not scored for field work", no penalties. Exclude from vineyard average.
   - fallow      → ceiling 69 + reason "Row is fallow"
   - replanting  → ceiling 79 + reason "Row is being replanted"

   Open tasks = status pending or sent (NOT acknowledged, NOT dismissed).
   Apply a task to a row only when task.rowId === row.id.
   Vineyard-scoped tasks (rowId null) affect vineyard OVERALL only — never every row.
   Penalties:
   - overdue open task (dueAt date < asOf date in vineyard timezone): -20 each, cap -40 from tasks, reason `Overdue: {title}`
   - open task due within 7 calendar days: -10 each (skip if already counted overdue), combined task penalty still capped at -40, reason `Due soon: {title}`

   Activities apply to a row when activity.rowId === row.id.
   Vineyard-scoped activities (rowId null / scopeType vineyard) apply to EVERY non-retired row.
   "Last N days" = inclusive calendar days in the vineyard timezone (America/Chicago for seed), NOT a raw 14×24h cutoff.
     Example: asOf 2026-08-24 → watering window start is 2026-08-10. A watering dated 2026-08-10 COUNTS.
   - No watering in last 14 days (row or vineyard-scoped): -15, reason "No watering logged in 14 days"
   - No pest_prevention AND no weed_prevention in last 21 days: -10, reason "No pest/weed work in 21 days"
   - health_observation on this row in last 14 days: -10, reason from details.notes if present, else "Recent health observation"

   Do NOT penalize missing harvests.
   Do NOT invent weather, variety characteristics, or vine-level scores.

   Vineyard overall score = average of scored field rows (active + replanting + fallow). Retired excluded.
   Vineyard reasons = the 3 worst row reasons (reddest / lowest score first), plus any vineyard-scoped task reasons.
   Max 3 reasons per row, most severe first.

2) API
   New module apps/api/src/modules/health/ (mirror harvests.router.ts).

   GET /api/v1/vineyards/:vineyardId/health
     → { data: { vineyardId, asOf, overall: { score, color, reasons }, rows: [...] } }

   Compute on the fly from Prisma (rows, tasks, activities for that vineyard, not deleted).
   Do not persist snapshots.
   404 if vineyard missing.
   If Auth middleware exists, this route is protected like the other feature routes.

   Import the shared scoring function. Do not create a second copy of the math on the API.

3) Web hooks + client
   - Add helper on apps/web/src/lib/api.ts
   - Add useVineyardHealth() in the same style as useHarvests / useVineyardRows
   - If a 401 handler already sends users to /login, leave it alone

4) Schematic health map (this is the "map")
   Build a small presentational component, e.g. VineyardHealthMap.

   It is a SCHEMATIC, not GIS:
   - No Mapbox, Google Maps, Leaflet tiles, GeoJSON, or per-row lat/lng.
   - Do not add geometry columns.
   - Each row is a labeled bar/block filled with its health color (use existing health swatch tokens / Tailwind health-* classes if present).
   - Show code + name on the bar. Score or primary reason on hover/small caption.
   - Click / keyboard activates → navigate to /rows (hash or query `?row=` is fine if easy; otherwise just /rows).
   - Overall vineyard color as a thin header/border on the schematic.
   - Layout: a simple readable arrangement derived from row codes/names, not a blank vertical list pretending to be a map. Suggested seed layout (hardcode positions only as a default schematic when no layout data exists):

         [S1 Hilltop East]
     [L1 North Slope]   [S3 West Trellis]
         [L2 Creek Bench]
         [S2 Road Front]
         [L3 Old Home Row]

   - If there are rows not in that set, append them under the schematic in code order.
   - Retired rows still render, muted/green per scoring rules, visually quieter.
   - Must work in the existing Tailwind card width (max-w-5xl dashboard). No canvas library required; SVG or styled divs are both fine. Prefer SVG or divs over adding a mapping dependency.

5) Dashboard cleanup (DashboardPage.tsx)
   New order, nothing else inserted:
     1. PageHeader (keep API badge + Set up vineyard)
     2. HEALTH VIEW
        - overall color + score + 1–2 vineyard reasons
        - VineyardHealthMap schematic
        - compact per-row list under the map (code, name, color chip, score, primary reason)
        - HealthLegend directly under this block (not at the bottom of the page)
     3. Quick actions (existing card; do not add new destinations)
     4. Upcoming tasks (existing)
     5. Recent harvests (existing)
   DELETE the placeholder map / "health scoring not implemented" card.
   DELETE the Active rows / Total length / Vines StatCard grid from Dashboard.
   Loading: include the health hook in the existing skeleton/error rollup.
   If health fails but rows/tasks/harvests work, still show the rest and an inline health error — do not blank the whole page.

6) Setup page (SetupPage.tsx)
   Put the vineyard statistics at the TOP, above the four step cards:
     - Active rows
     - Total length
     - Vines
   Reuse summarizeRows + StatCard from Dashboard (extract shared helpers if they currently live only in DashboardPage; do not duplicate the math).
   Empty vineyard → short empty state pointing at /rows, then still show the step cards.
   Do not build Varieties / Calendar / threshold editors this slice. The four step cards stay copy-only.

7) Rows
   RowCard shows a health color chip + optional primary reason (one line).
   RowsPage should load health alongside rows. If health is still loading, render cards without a chip rather than blocking the page.
   Do not conflate row.status (active/fallow/replanting/retired) with health color. Both can show.

8) Seed / sanity — expected colors (asOf = 2026-08-24, America/Chicago)

   Do NOT rewrite seed data. Do NOT add activities just to force a green row.

   Window math (must match these colors):
   - "Last N days" = inclusive calendar days in the vineyard timezone, not 14×24h.
     Vineyard watering on 2026-08-10 COUNTS as watering within 14 days.
   - Open tasks = pending | sent.
   - Vineyard-scoped tasks (rowId null) affect OVERALL only.
   - Vineyard-scoped activities apply to every non-retired row.
   - Start 100, floor 0. Task penalties cap at -40 per row.
   - fallow ceiling 69; replanting ceiling 79.
   - Banding: green ≥80, yellow ≥70, orange ≥60, else red.
   - Vineyard overall = average of L1,L2,S1,S2,S3,L3.

   Expected row results against current Cedar Ridge seed:

     L1 North Slope     70  yellow   Overdue: Dormant prune… ; No pest/weed work in 21 days
     L2 Creek Bench     50  red      Overdue beetle spray + frost watch (task cap -40) ; No pest/weed
     S1 Hilltop East    70  yellow   Overdue: Drip cycle… ; No pest/weed
     S2 Road Front      70  yellow   Overdue vine replace ; No pest/weed ; replanting cap unused
     S3 West Trellis    50  red      Overdue spring feed + strip spray (task cap -40) ; No pest/weed
     L3 Old Home Row    69  yellow   No pest/weed then fallow ceiling 69

   Expected vineyard overall: 63 orange
     average (70+50+70+70+50+69)/6 = 63
     reasons: L2 and S3 first, plus "Overdue: Weekly vineyard health digest"

   Zero green rows is CORRECT. Do not invent a green row.
   If the UI is all-red, the 14-day watering window is wrong (Aug 10 must count) or vineyard-scoped tasks are leaking onto every row — fix that.

9) Docs
   Update CONTINUE.md:
     Health colors v1 live: schematic map + scores on Dashboard, chips on Rows; stats moved to Setup.
     Next priority = store a real row layout / sketch map, OR role checks on writes, OR “who did what” on Log work — pick one and say why in one sentence.
   Update docs/api-outline.md Health section to match the single GET you shipped (recalculate + map tiles stay future).

==================================================
OUT OF SCOPE
==================================================
- Mapbox / Google Maps / Leaflet tiles / satellite overlay
- Per-row GPS, GeoJSON, polygons, or a layout editor
- HealthSnapshot persistence or history sparkline
- Recalculate POST, AI assistant, weather
- Vine / Block / Variety models (variety stays a string on Row)
- Editing healthThresholds in Setup
- Full RBAC
- Replacing Harvests or Activities
- Rewriting Express to Nest
- TanStack Query

==================================================
DONE WHEN
==================================================
- Dashboard opens on a schematic vineyard map with seed colors: L1/S1/S2/L3 yellow, L2/S3 red, overall orange 63
- Under the map: per-row reasons list + HealthLegend
- Then quick actions, upcoming tasks, recent harvests
- Dashboard no longer shows Active rows / Total length / Vines
- Those three stats appear at the top of /setup
- Placeholder "health scoring not implemented" card is gone
- GET /api/v1/vineyards/:id/health returns overall + per-row score/color/reasons
- Row cards show a health chip
- Completing an overdue task or logging a watering changes that row’s color after reload
- Shared scoring function is the only place the math lives
- No mapping SDK added
- CONTINUE.md updated
