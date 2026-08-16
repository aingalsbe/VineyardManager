# Architecture

```text
Web (React + Vite)  ←→  API (Express /api/v1)  ←→  PostgreSQL (Prisma)
Android / Expo  ↗                              ↘  Weather + assistant
                     ↑
              Offline outbox (SQLite) on mobile
```

## Current scaffold

- `apps/web` — Vite dev server on `:5173`, proxies `/api` → `:3001`
- `apps/api` — Express on `:3001`
- `packages/shared` — types and Zod schemas used by both
- `apps/api/prisma` — PostgreSQL schema + versioned migrations

## Persistence

PostgreSQL with UUID primary keys, soft deletes, and JSONB for notification prefs and health thresholds. Prisma owns the schema. Never edit a committed migration; add a new one.

First tables: `users`, `vineyards`, `rows`, `tasks`. Local database: `docker compose up -d` then `pnpm db:migrate`.

## Auth (not wired yet)

Email + password, JWT (or session cookie for web). Roles in the token: `power_user | manager | viewer`.

## Offline

Field logging must survive a dead radio. Activity writes will go through a local outbox; `POST /api/v1/sync/push` and `GET /api/v1/sync/pull` are reserved in the API outline.

## Phased build

1. Auth + vineyard / row / vine CRUD
2. Activity logging + rule-based health colors
3. Offline outbox + sync
4. Weather + scheduled notifications
5. Assistant endpoints + UI
6. Invites, role enforcement, Expo client
