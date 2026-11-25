# Vineyard Manager

Operations software for a small vineyard: a live health map, maintenance logging, harvest tracking, and weekly guidance. Built as a TypeScript monorepo so the web app and API share one domain model.

The first users are power users who know the vineyard well — they set up rows and varieties, log work in the field, and want a green / yellow / orange / red overlay that explains *why* a row needs attention.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web | React 19 + Vite + TypeScript + Tailwind CSS v4 | Fast field-ready UI with shadcn/ui and lazy-loaded Recharts |
| API | Express 5 + TypeScript | Same language as web and `@vineyard/shared`; explicit `/api/v1` contract |
| Shared | Zod + TypeScript types | One source of truth for roles, activities, health colors, and scoring |
| Database | PostgreSQL + Prisma | Versioned migrations in `apps/api/prisma` |
| Workspace | pnpm + Turborepo | Install once, run `web` and `api` together |

See the [repository README](../README.md) for the full project overview and [CHANGELOG.md](CHANGELOG.md) for release history (`v1.1.0`).

## Workspace layout

```text
VineyardManager/
├── apps/
│   ├── web/          # React + Vite SPA
│   └── api/          # Express API, Prisma schema/migrations, tests
├── packages/
│   └── shared/       # Types, Zod schemas, health & metrics scoring
├── deploy/           # Dockerfile, Nginx configs, backup & entrypoint scripts
├── docs/             # Domain, API, and season plans
├── CHANGELOG.md      # Release notes
├── SETUP.md          # New-machine setup guide
├── AGENTS.md         # Conventions for coding sessions
└── package.json
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20.11 or later (24 LTS recommended)
- [pnpm](https://pnpm.io/) 9+ — `corepack enable` then `corepack prepare pnpm@10.14.0 --activate`

If PowerShell blocks `npm.ps1` / `pnpm.ps1`, call them through Command Prompt (`cmd /c npm -v`) or use `npx pnpm@10.14.0`.

## Setup

```bash
cd VineyardManager
corepack enable
pnpm install
```

Copy env files:

```bash
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env
```

On macOS / Linux use `cp` instead of `copy`.

Start Postgres and apply the committed migrations:

```bash
docker compose up -d
pnpm db:migrate:deploy
```

Use `pnpm db:migrate` only when you are creating a new migration. Do not edit SQL that has already been committed.

Load sample vineyard data (idempotent — safe to re-run):

```bash
pnpm db:seed
```

## Develop

```bash
pnpm dev
```

That starts both apps:

- Web: http://localhost:5173 — Dashboard, Rows, Tasks, Log work, Setup, Settings
- API: http://localhost:3001
- Health check: http://localhost:3001/api/v1/health

Run one app at a time with `pnpm dev:web` or `pnpm dev:api`.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Start web + API |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm lint` | Package lint scripts (TypeScript for now) |
| `pnpm db:migrate` | Create / apply Prisma migrations |
| `pnpm db:migrate:deploy` | Apply committed migrations |
| `pnpm db:seed` | Load sample users, vineyard, rows, and tasks |

## Domain starting points

Shared types already cover the vineyard model from the product docs:

- Vineyard → rows → vines, plus varieties
- Activities (pruning, watering, fertilization, pest / weed work, harvest, observations)
- Health colors and scores
- Scheduled tasks and notifications
- Rows with variety, length, and vine count

See `packages/shared` and `docs/` before adding tables or routes.

## Roadmap & active backlog

See [`VineyardManager-Next-Steps.md`](VineyardManager-Next-Steps.md), [`VineyardManager-Bugs.md`](VineyardManager-Bugs.md), and [`docs/season-close-new-plan.md`](docs/season-close-new-plan.md) for current slices and upcoming work.

## License

Private project. Not licensed for distribution.
