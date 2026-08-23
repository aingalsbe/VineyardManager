# Requirements alignment

**Date:** 2026-08-21  
**Codebase:** `C:\AIProjects\VineyardManager` (through dashboard work, including harvests and tasks)  
**PRD:** [Vineyard Manager Requirements](https://docs.google.com/document/d/1GjEWIEQdblML3X8VY30aE2t3WQ0Yn5PKW8pAMZzTbOs/edit) (Google Drive, AIProjects / Vineyard Manager)

Status labels: **Done** · **Partial** · **Not started** · **Won’t do**

---

## Verdict

**Partially aligned, on a sensible path.**

The web app is a working operations console for a single small vineyard: rows, tasks, harvests, and a dashboard with real data. It is **not** yet the product in the PRD — a logged-in health map with weather alerts, AI assistance, an Android app, and vine-level activity logging.

The PRD’s functional-requirements table is still placeholders (`P0 | Add requirement`). This document maps **goals, user journeys, non-functional requirements, and dependencies** instead of that empty table.

---

## Alignment notes

These are product choices, not forgotten tickets:

| PRD | Current product | Note |
| --- | --- | --- |
| Rows, plus optional parcels; Journey 1 is a map overlay | **Rows** are the working unit (`L1` / `S1`, length, vine count, variety). “Blocks” were renamed | Stay with Rows unless parcels are needed again |
| Harvest as an activity (cluster condition + weight) | **First-class Harvest** model (yield, unit, date, crew, notes) | Deliberate; general Activities CRUD is still later |
| Individual vines and spacing | Row-level `vineCount` and length only; no `Vine` table or vine UI | Gap vs Journey 3 |
| Log in on first open | No login; seed users exist, passwords are placeholders | Gap vs Journey 1 and Security |
| Website **and** Android app | Web only | Goal 7 is half-done |

Non-goals are still honored:

- **Won’t do:** marketplace / large-audience product
- **Won’t do:** camera or picture analysis of leaves, pests, or damage

---

## Accomplished

| Status | Area | PRD reference | In the repo |
| --- | --- | --- | --- |
| **Partial** | Web app | Goal 7 | React + Vite + Tailwind. Nav: Dashboard, Rows, Tasks, Harvests, Log work, Setup, Settings |
| **Partial** | Dashboard | Goal 1, Journey 1 | Active rows, total length, vine count; upcoming/overdue tasks; recent harvests; quick actions. No login, no health map, no row color overlay |
| **Partial** | Row setup | Journey 2 “Map my vineyard” | Create/edit rows: code, name, variety (free text), length ft/in, vine count, planted year, status, notes |
| **Partial** | Harvest volume | Goal 2, Journey 3 Harvesting, Metrics 2 | Harvest create/edit/history against a **row**; units lb/kg/lug/bin/flat/bushel/other; dashboard recents |
| **Partial** | Maintenance tracking | Goal 3 | Tasks create/edit/status, optional row link; dashboard upcoming/overdue. Not an auto-seeded annual calendar from address |
| **Partial** | Usability | NFR Usability | High-contrast palette, large type, simple cards and dialogs |
| **Partial** | Compatibility | NFR Compatibility | Desktop web (modern Chrome/Safari). No Android app; no IE |
| **Done** | Persistence | Implied | Postgres + Prisma, Docker, seed data |
| **Partial** | Roles | NFR Security | `power_user` / `manager` / `viewer` in the schema; Settings describes them; **not enforced** |

Supporting platform (not called out as user journeys, but required to operate):

- Monorepo (pnpm + Turborepo): `apps/web`, `apps/api`, `packages/shared`
- REST `/api/v1` for vineyards, rows, tasks, harvests
- Health check; Vite proxies `/api` to the API

---

## Outstanding

### Journey 1 — Open and see health

**Not started** except a stats dashboard and a map stub.

- Email + password login
- Visual vineyard map, oriented rows, variety labels, unique codes (`L1`, `S1`)
- Green / yellow / orange / red overlay (80–100 / 70–80 / 60–70 / &lt;60)
- Click a row: reason for the color and suggested mitigations
- Menu to other management areas (nav exists; health drill-down does not)

### Journey 2 — Setup

**Partial** (rows can be created by hand). Still missing:

- Variety catalog with auto-lookup of characteristics
- Spacing between vines; more than one variety string per row
- Address → auto Jan–Dec calendar (fertilize, prune, pest, weed, harvest, replacement, dormant, winterize, water), then customize
- UI to set health color cutoffs and “how far out” (thresholds JSON exists on Vineyard; no editor)
- Weather notification prefs: severe weather, drought/overwater, frost/snow

### Journey 3 — Manage (largest gap)

Log work page is a **stub** (disabled buttons, no API).

- Click a row and manage **row, variety, or individual vine**
- Activity logging with typed details:
  - Watering: duration (15-min steps), method (drip / flood / hose / sprinkler)
  - Fertilization: product, amount per vine
  - Pest: spray / dust / proximity, targets, amount
  - Weed: spray / dust / manual
  - Harvest: cluster condition (best → unusable) **in addition to** the Harvest model’s yield
  - Health observation: pests, vine/leaf/cluster damage, notes
- Bulk apply to many vines/rows
- After save: next watering/fertilize/pest/weed windows, notifications, health update
- AI analysis of general observations

### Goals not started

| Goal | What the PRD asks |
| --- | --- |
| 4 | Weekly growing-season notifications: maintenance, weather, health summary |
| 5–6 | AI on the map overlay; assistant remedies; schedule suggestions |
| 7 | Android app (web only today) |
| 8 | Real auth; email/password updates; live notification frequency and naming settings |

### Non-functional and dependencies

| Status | Item |
| --- | --- |
| **Not started** | Offline cache + sync for field logging (PRD: management works offline, then syncs) |
| **Not started** | Enforce roles on API and UI |
| **Not started** | Weather service |
| **Not started** | Variety lookup from the web / extension sources |
| **Not started** | Email (or push) delivery |
| **Not started** | AI (xAI / assistant module) |

---

## Goal scorecard

| # | Goal | Status |
| --- | --- | --- |
| 1 | Dashboard + health drill-down (row / variety / vine) | **Partial** — stats dashboard only |
| 2 | Manual events + observations | **Partial** — harvests and tasks; not pruning/water/fertilizer/pest/weed/observations |
| 3 | Annual growing cycle | **Partial** — tasks exist; no auto calendar or rain events |
| 4 | Weekly notifications + weather | **Not started** |
| 5 | AI automation on overlay + scheduling | **Not started** |
| 6 | Map assistant / remedies | **Not started** |
| 7 | Web and Android | **Partial** — web only |
| 8 | Personalized owner settings | **Not started** (Settings is copy-only) |

---

## Suggested next slices

1. **Activities / Log work** — closest to Journey 3 and Goal 2 (already the CONTINUE.md priority)
2. **Auth + roles** — Journey 1 login and NFR Security
3. **Health rule engine + row colors** — makes the dashboard match Goal 1
4. **Weather + notifications**
5. **Android** later

---

## Sources

- PRD: [Vineyard Manager Requirements](https://docs.google.com/document/d/1GjEWIEQdblML3X8VY30aE2t3WQ0Yn5PKW8pAMZzTbOs/edit)
- In-repo: `CONTINUE.md`, `docs/api-outline.md`, `docs/data-model.md`, `apps/api/prisma/schema.prisma`, web routes in `apps/web/src/App.tsx`
