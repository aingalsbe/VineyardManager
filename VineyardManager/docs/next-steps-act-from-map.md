# Act from the map — Grok Build prompt

**Launch (TUI already open in the project folder):**
`@docs/next-steps-act-from-map.md Execute this slice. Follow it strictly. Do not expand scope.`

Load this whole file into Grok Build (agent / multi-file).

Do not use `VineyardManager-Next-Steps.md`. Living status lives in `VineyardManager/CONTINUE.md`.

**Last updated:** 2026-08-28  
**Repo:** https://github.com/aingalsbe/VineyardManager  
**Working tree:** nested at `VineyardManager/`  
**Depends on:** Auth, Health v1, vineyard edit, header logo, Setup `rowLayout`. A field-accurate 15-row seed + fit-to-screen map may already be on disk (`docs/next-steps-rows-true.md`). Adapt. Do not revert those slices.

Read `VineyardManager/AGENTS.md` first. Small, focused diff. One feature slice only.

==================================================
CURRENT STATE
==================================================
- Dashboard `VineyardHealthMap` + `RowLayoutBar`: click is an `<a href="/rows?row={code}">`. That is the behavior this slice replaces.
- Health: `GET /api/v1/vineyards/:id/health` returns overall + per-row `{ rowId, score, color, reasons[] }`. Reasons look like `Overdue: {title}`, `Due soon: {title}`, `No watering logged in 14 days`, `No pest/weed work in 21 days`.
- Log work: `POST /api/v1/vineyards/:id/activities` with vineyard or row scope. UI already has `ActivityFormDialog` / `ACTIVITY_TYPES` on `/activities`. `performedBy` comes from the signed-in user.
- Tasks: open = `pending` | `sent`. Complete = `acknowledged`. Dismiss = `dismissed`. Existing Tasks page already marks complete / changes status. Reuse that PATCH. Do not invent a second status enum.
- Setup map is the layout *editor*. Do not put log-work actions on Setup.
- Harvest *yield* lives on `/harvests`. Harvest type on Log work is a note only. Do not log yield from the map.
- Web does not use TanStack Query. Match existing hooks (`useVineyardHealth`, `useVineyardTasks`, activities helpers).
- No photo underlay. No new RBAC.

==================================================
GOAL
==================================================
Aaron sees a yellow or red bar on the Dashboard, clicks it, and does the work that will change the color — without leaving the dashboard for a treasure hunt on /tasks or /activities.

==================================================
REQUIREMENTS
==================================================

1) Click a bar → row action panel, not /rows

   On Dashboard only:
   - Click / Enter on a placed bar (and on an unplaced tray chip if those render on Dashboard) opens a panel: popover, drawer, or small modal. Pick one component style already in the app.
   - Panel shows: code, name, health color + score, reasons (same strings health already returns).
   - Do **not** navigate to `/rows?row=` as the primary click. Keep a text link “Open row” in the panel for the old destination.
   - Esc / click-outside closes the panel.
   - Keyboard: focused bar + Enter opens the same panel.

2) Actions from the reasons (reuse existing write paths)

   Derive buttons from that row’s health reasons + open tasks for that rowId. Do not invent a second scorer.

   - If a reason starts with `Overdue:` or `Due soon:` → **Complete task** for the matching open task (match on title when the reason is `Overdue: {title}` / `Due soon: {title}`). Calls the existing task-complete path (`acknowledged`). If the title cannot be matched, list that row’s open tasks and complete the one the user picks. Do not complete vineyard-scoped tasks from a row panel.
   - If a reason mentions watering → **Log watering** for this row. Open the existing activity dialog (or a slimmed row-scoped version) with `activityType=watering`, `scopeType=row`, `rowId` preset. User confirms and saves.
   - If a reason mentions pest/weed → **Log pest prevention** and/or **Log weed prevention**, same dialog, type preset.
   - Always offer **Log other work** (opens the existing activity dialog scoped to this row, type not forced).
   - Do not add “Log harvest yield” here.

   After a successful complete or log:
   - Close or keep the panel, your call, but **reload health** (and tasks if you completed one) so the bar color/reasons update without a full page refresh if the current hooks allow it. A panel-level refetch is enough. If hooks only refetch on mount, trigger that refetch. Do not build TanStack Query to get it.

3) Empty / green rows

   Green or no-reason rows still open the panel. Show score + “No action needed from health rules” and still offer **Log other work** + **Open row**. No fake complete-task button.

4) Upcoming-tasks list on Dashboard

   Leave the existing upcoming-tasks card. Optional and small: clicking a task title that has a rowId selects that row’s panel. Skip if it needs a new routing library.

5) API

   No new endpoints unless health reasons lack task ids and matching by title is too brittle. Prefer title match + existing `GET` tasks filtered by row.
   If you must, adding `taskId` on a health reason is allowed — but then you must keep the shared scorer as the only math and only add an optional id on the reason object. Do not fork scoring.

6) Docs

   Update `VineyardManager/CONTINUE.md`:
     Last completed: Dashboard map bars open a row action panel; complete overdue task or log watering/pest/weed against that row; health reloads after save.
     Next priority: pick something else (role checks, weekly task generation, or row rename pass). No photo underlay.

==================================================
OUT OF SCOPE
==================================================
- Photo / sketch underlay
- Setup editor changes (except don’t break it)
- New activity types, harvest yield from the map
- Health formula changes (except optional taskId on reasons)
- RBAC / new roles
- Block / Variety / Vine models
- Mapbox, GIS, TanStack Query, Nest rewrite
- Mobile-only redesign

==================================================
DONE WHEN
==================================================
- Clicking a Dashboard health bar opens a panel for that row, not /rows
- Overdue reason → complete that task via existing PATCH; bar can go less-red after health reload
- “No watering in 14 days” → log watering on that row via existing POST; color can update after reload
- Pest/weed reason → matching log-work type
- Green row still opens the panel with log-other + open-row only
- Setup layout editor still saves positions
- Existing /activities and /tasks pages still work
- CONTINUE.md updated
