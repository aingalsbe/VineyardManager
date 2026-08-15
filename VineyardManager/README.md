# Vineyard Manager

Operations software for a small vineyard: a live health map, maintenance logging, harvest tracking, and weekly guidance. Built as a TypeScript monorepo so the web app and API share one domain model.

The first users are power users who know the vineyard well — they set up rows and varieties, log work in the field, and want a green / yellow / orange / red overlay that explains *why* a row needs attention.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web | React + Vite + TypeScript + Tailwind CSS | Fast local UI, shadcn/ui-ready |
| API | Express + TypeScript | Same language as the web app and `@vineyard/shared`; easy to keep the `/api/v1` contract explicit |
| Shared | Zod + TypeScript types | One source of truth for roles, activities, health colors, and payloads |
| Database | PostgreSQL + Prisma | Versioned migrations in `apps/api/prisma` |
| Workspace | pnpm + Turborepo | Install once, run `web` and `api` together |

Auth, weather, and the Android/Expo client come later. Blocks and scheduled tasks are the first persisted slice.

## Repository layout

```text
VineyardManager/
├── apps/
│   ├── web/          # React + Vite frontend
│   └── api/          # Express API
├── packages/
│   └── shared/       # Types, Zod schemas, constants
├── docs/             # Domain and API notes for humans and agents
├── AGENTS.md         # Conventions for future coding sessions
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

## Develop

```bash
pnpm dev
```

That starts both apps:

- Web: http://localhost:5173
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

## Domain starting points

Shared types already cover the vineyard model from the product docs:

- Vineyard → rows → vines, plus varieties
- Activities (pruning, watering, fertilization, pest / weed work, harvest, observations)
- Health colors and scores
- Scheduled tasks and notifications
- Blocks / parcels as an optional grouping above rows

See `packages/shared` and `docs/` before adding tables or routes.

## Next build slices

1. Auth + vineyard / row / vine CRUD
2. Activity logging + rule-based health colors
3. Offline outbox + sync (needed in the field)
4. Weather + weekly notifications
5. Assistant endpoints
6. Roles, invites, and an Expo client

## License

Private project. Not licensed for distribution.
