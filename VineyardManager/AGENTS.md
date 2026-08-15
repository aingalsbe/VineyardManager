# Agent conventions — Vineyard Manager

Read this before changing code. The product docs in `docs/` and the types in `packages/shared` are the source of truth. Do not invent a parallel domain model.

## What this is

A small-vineyard operations app: web + API now, Android later. The owner maps rows, logs work (prune, water, fertilize, pest/weed, harvest, observations), and sees a health overlay (green / yellow / orange / red) with reasons.

It is **not** a marketplace product. It is **not** a computer-vision leaf scanner.

## Repo map

| Path | Owns |
| --- | --- |
| `apps/web` | React + Vite UI. Talks to `/api/v1` only. |
| `apps/api` | Express HTTP API. Feature folders under `src/modules`. |
| `packages/shared` | Types, Zod schemas, enums, health/activity constants. |
| `docs/` | Data model, API outline, architecture notes. |

## Hard rules

1. **TypeScript everywhere** in `apps/` and `packages/`. No new JavaScript source files.
2. **Domain types live in `@vineyard/shared`.** If web and API both need a shape, put it in shared first. Do not duplicate enums or DTOs.
3. **API is REST at `/api/v1`.** Follow `docs/api-outline.md`. Error body is always `{ "error": { "code": string, "message": string } }`. Use ISO-8601 timestamps and JSON.
4. **UUIDs, soft deletes, audit timestamps.** Every persisted entity gets `createdAt` / `updatedAt` and optional `deletedAt`. Do not hard-delete user data.
5. **Activities are the write path.** Scope is `vineyard | row | variety | vine | block`. Details go in a typed JSON payload, not a new table per activity kind.
6. **Feature folders, not layer dumps.** Add `modules/<feature>/` (router, service, later repository). Do not create a global `controllers/` or `utils.ts` junk drawer.
7. **Small, verifiable diffs.** One vertical slice per change. Do not rewrite the monorepo to add a route.
8. **No extra product surface.** Do not add photo analysis, public signup marketing, or a second API style (GraphQL, tRPC) unless the user asks.

## Stack choices (do not churn)

- Web: React + Vite + TypeScript + Tailwind CSS v4. shadcn/ui goes in `apps/web/src/components/ui`.
- API: Express + TypeScript. Chosen so web, API, and shared stay in one type system. Do not switch to FastAPI/Nest/tRPC unless asked.
- Workspace: pnpm + Turborepo.
- Persistence: PostgreSQL + Prisma. Schema and migrations live in `apps/api/prisma`. Never rewrite a committed migration; add a new one. JSONB is fine for activity details, health thresholds, and notification prefs.
- Future AI: SpaceXAI / xAI first (`build-with-ai` skill). Keep assistant calls behind an API module named `assistant`.

## Vineyard language

Use the product words, not generic farm synonyms:

- **Vineyard** — the property
- **Block / parcel** — optional grouping of rows (hillside, irrigation zone)
- **Row** — coded `L1`, `S3`, etc., unique per vineyard
- **Vine** — one plant in a row (`position` is 1-based)
- **Variety** — Norton, Chardonel, …
- **Activity** — something that happened
- **Task** — something scheduled
- **Health** — 0–100 score plus `green | yellow | orange | red`

Health defaults (owner-customizable later):

| Color | Score | Meaning |
| --- | --- | --- |
| Green | 80–100 | Healthy, no major actions |
| Yellow | 70–79 | Potential actions |
| Orange | 60–69 | Action needed soon |
| Red | < 60 | Immediate attention |

Roles: `power_user` (setup + users), `manager` (operate + notify), `viewer` (read only).

## How to run

```bash
cd VineyardManager
pnpm install
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3001/api/v1/health

Web proxies `/api` to the API in Vite, so browser calls should use `/api/v1/...`.

## When adding a feature

1. Update or reuse types/schemas in `packages/shared`.
2. Add or extend an API module under `apps/api/src/modules/<feature>`.
3. Add the UI in `apps/web/src` (pages/components for that feature only).
4. Update `docs/api-outline.md` if you add or change a route.
5. Keep offline in mind: activity writes will go through a local outbox later. Do not assume the phone is online.

## UI notes

- Readable type, high contrast, obvious color — older users in sun/field conditions.
- shadcn/ui: run the official CLI from `apps/web`. Do not hand-roll a second component kit.
- Map overlay comes later (Leaflet or Mapbox). Keep row identity (`code`, `sortOrder`, `orientation`) stable.

## What “done” means

- Types check (`pnpm typecheck`).
- No secrets committed. Use `.env` + `.env.example`.
- Git status left clean: commit or leave only files the user should review, as they asked.
- If you touch web UI, verify in the browser (not just a screenshot).

## Out of scope until asked

- Camera / leaf image analysis
- Multi-tenant marketing / billing
- Rewriting Express to Nest or FastAPI
- Adding `apps/mobile` (Expo is planned; do not scaffold it early)
