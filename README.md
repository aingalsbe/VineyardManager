# Vineyard Manager

Operations software for a small vineyard (**Abide in the Vine Vineyard**): live row-by-row health mapping, field work logging, scheduled tasks, harvest & trend tracking, local weather integration, and weekly growing-season digests.

Built as a TypeScript monorepo (`apps/web`, `apps/api`, `packages/shared`) so the browser UI and REST API share one validated domain model.

- **Current release:** [`v1.1.0`](https://github.com/aingalsbe/VineyardManager/releases/tag/v1.1.0) · [Changelog](VineyardManager/CHANGELOG.md)
- **Production:** https://abidevine.hipfog.com/

---

## Features

- **Vineyard Health Map:** Row-level `0–100` scoring with color overlay (`green` 80–100 · `yellow` 70–79 · `orange` 60–69 · `red` < 60) and plain-language reasons explaining why a row needs attention.
- **Field Operations:** Log activities (`pruning`, `watering`, `fertilizing`, `pest_prevention`, `weed_prevention`, `harvest`, `health_observation`) scoped to vineyard, row, variety, vine, or block; manage scheduled tasks and harvests.
- **Metrics & Trends:** Interactive health history and harvest comparisons by month, quarter, and year.
- **Weather & Rain Automation:** Current conditions, 7-day forecast, alerts, and daily rain checks via Open-Meteo (with caching, timeouts, and single-flight deduplication).
- **Weekly Growing-Season Digest:** Previewable HTML/text email summaries delivered via Resend HTTPS API (or SMTP) with recipient allowlist testing.
- **Roles & Security:** `power_user`, `manager`, and `viewer` roles; `HttpOnly` `SameSite=Lax` session cookies with `tokenVersion` instant revocation (plus Bearer fallback), CSRF origin/header verification, rate limiting, `helmet` & Nginx security headers, and magic-byte upload checks.
- **Seasons (Step 1):** Calendar-year season model, routing, and backfill (Close/New Season Steps 2–6 planned in [`docs/season-close-new-plan.md`](VineyardManager/docs/season-close-new-plan.md)).

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Web** | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, Recharts |
| **API** | Express 5, TypeScript, REST at `/api/v1` |
| **Shared** | `@vineyard/shared` (TypeScript domain types, Zod schemas, health & metrics scoring) |
| **Database** | PostgreSQL 16 + Prisma 6 (committed migrations in `apps/api/prisma`) |
| **Monorepo & CI** | pnpm workspaces, Turborepo, GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) |
| **Deployment** | Multi-stage Docker build + Docker Compose behind Nginx (`hipfog-proxy`) |

---

## Repository Layout

```text
.
├── .github/workflows/
│   └── ci.yml                 # Typecheck, API tests, build, and advisory prod audit
├── Scripts/                   # Windows local dev Start / Stop / Backup PowerShell helpers
└── VineyardManager/           # pnpm + Turborepo workspace
    ├── apps/
    │   ├── web/               # React + Vite SPA (proxies /api -> :3001 in dev)
    │   └── api/               # Express API, Prisma schema/migrations, node:test suite
    ├── packages/
    │   └── shared/            # Shared types, Zod schemas, scoring engine
    ├── deploy/                # Dockerfile, Nginx configs, entrypoint, backup-prod.sh
    ├── docs/                  # API outline, architecture notes, season plan
    ├── CHANGELOG.md           # Release history
    ├── SETUP.md               # New-machine setup guide
    └── AGENTS.md              # Engineering conventions
```

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js** 20.11+ (24 LTS recommended)
- **pnpm** 10+ (`corepack enable && corepack prepare pnpm@10.14.0 --activate`)
- **Docker Desktop** (for local PostgreSQL)

### 1. Install dependencies & configure environment

```bash
cd VineyardManager
pnpm install
```

Copy the example environment files:

```powershell
# Windows (PowerShell)
Copy-Item apps\api\.env.example apps\api\.env
Copy-Item apps\web\.env.example apps\web\.env
```

```bash
# macOS / Linux
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 2. Start PostgreSQL, migrate, and seed

```bash
docker compose up -d
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
```

Seeded local accounts (password `VineyardDev1!` for all three):
- **Owner (`power_user`):** `owner@vineyard.local`
- **Manager (`manager`):** `manager@vineyard.local`
- **Viewer (`viewer`):** `viewer@vineyard.local`

### 3. Run the app

- **Windows (all-in-one script):**
  ```powershell
  & .\Scripts\Start-VineyardManager.ps1
  ```
- **Manual (any OS, from `VineyardManager/`):**
  ```bash
  pnpm dev
  ```

Services:
- **Web UI:** http://localhost:5173
- **API Health:** http://localhost:3001/api/v1/health

---

## Common Commands

Run from `VineyardManager/`:

| Command | Description |
| --- | --- |
| `pnpm dev` | Start web (`:5173`) and API (`:3001`) together |
| `pnpm typecheck` | Run TypeScript checks across `shared`, `api`, and `web` |
| `pnpm --filter @vineyard/api test` | Run the API test suite (`node:test` via `tsx`) |
| `pnpm build` | Build production web bundle and API artifacts |
| `pnpm db:generate` | Regenerate Prisma Client after schema changes |
| `pnpm db:migrate:deploy` | Apply committed Prisma migrations |
| `pnpm db:seed` | Load idempotent sample vineyard data |

---

## Production Deployment

Production runs on Docker Compose behind `hipfog-proxy` at https://abidevine.hipfog.com/. See [`VineyardManager/deploy/README.md`](VineyardManager/deploy/README.md) for the live backup script (`deploy/scripts/backup-prod.sh`), container rebuild steps, Nginx reload commands, and shared-VPS guardrails.

---

## Documentation

- [Release Changelog](VineyardManager/CHANGELOG.md)
- [New-Machine Setup Guide](VineyardManager/SETUP.md)
- [API Outline (`/api/v1`)](VineyardManager/docs/api-outline.md)
- [Production Deploy Guide](VineyardManager/deploy/README.md)
- [Engineering Conventions (`AGENTS.md`)](VineyardManager/AGENTS.md)
- [Pipeline Board (`VineyardManager-Next-Steps.md`)](VineyardManager/VineyardManager-Next-Steps.md)
- [Known Issues (`VineyardManager-Bugs.md`)](VineyardManager/VineyardManager-Bugs.md)
- [Close / New Season Plan](VineyardManager/docs/season-close-new-plan.md)

---

## License

Private project. Not licensed for redistribution.
