# Vineyard Manager: new-laptop setup

How to get Vineyard Manager running on a fresh Windows laptop. Everything here was checked against the repo files (`package.json`, `.nvmrc`, `docker-compose.yml`, `apps/api/src/config.ts`, `apps/api/.env.example`, `apps/web/vite.config.ts`, `prisma/seed.ts`, `C:\AIProjects\Scripts\*.ps1`) on Oct 17, 2026.

## 1. Prerequisites

| Tool | Version (from the repo) | Notes |
| --- | --- | --- |
| Windows 10/11 | | PowerShell 5.1 is enough |
| Docker Desktop | any current | Runs Postgres `postgres:16-alpine` (`docker-compose.yml`) |
| Node.js | **24** (`.nvmrc`); minimum `>=20.11.0` (`engines`) | |
| pnpm | **10.14.0** (`packageManager`); minimum `>=9` | `corepack enable` then `corepack prepare pnpm@10.14.0 --activate` |
| Git | any current | Git for Windows includes Git Credential Manager |

**GitHub sign-in:** sign in to GitHub in the browser with the credentials saved in 1Password. Then let Git Credential Manager prompt on the first clone, or run `gh auth login` if you use the GitHub CLI.

## 2. Git identity

```powershell
git config --global user.name "Aaron Ingalsbe"
git config --global user.email aingalsbe@gmail.com
```

## 3. Clone

The git root is **`C:\AIProjects`** (not the VineyardManager folder). Remotes (`git -C C:\AIProjects remote -v`):

- `origin` = https://github.com/aingalsbe/VineyardManager.git
- `nas` = `N:\AIProjects\VineyardManager.git` (NAS backup copy, needs the N: drive mapped)

```powershell
git clone https://github.com/aingalsbe/VineyardManager.git C:\AIProjects
git -C C:\AIProjects remote add nas N:\AIProjects\VineyardManager.git   # optional, if the NAS is mapped
```

If GitHub is unavailable, clone from the NAS instead: `git clone N:\AIProjects\VineyardManager.git C:\AIProjects`.

## 4. Folder locations

- App: `C:\AIProjects\VineyardManager` (git root `C:\AIProjects`, which also holds `C:\AIProjects\Scripts`)
- Keep UpwardScoreboard separate at `C:\UpwardScoreboard`. Don't nest one inside the other.

## 5. Environment files (.env)

`.env` files are gitignored (`git check-ignore .env` holds) and the NAS mirror skips them, so recreate them from the examples. Never commit `.env`.

```powershell
cd C:\AIProjects\VineyardManager
Copy-Item apps\api\.env.example apps\api\.env
Copy-Item apps\web\.env.example apps\web\.env
```

The API loads `apps/api/.env` itself (`config.ts`). Variables actually read by the code:

| Variable | What it is | Where the value comes from |
| --- | --- | --- |
| `PORT` | API port (default 3001) | `.env.example` |
| `WEB_ORIGIN` | CORS origin of the web app | `.env.example` (`http://localhost:5173`) |
| `DATABASE_URL` | Postgres connection used by Prisma | `.env.example`; matches `docker-compose.yml` |
| `JWT_SECRET` | Signs login tokens | Dev value in `.env.example`; pick a long random string for anything real |
| `JWT_EXPIRES_IN` | Token lifetime | `.env.example` |
| `UPLOAD_DIR` | Folder for uploaded files | `.env.example` (`uploads`) |
| `APP_URL` | Base URL used in email links | `.env.example` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` | Mail server for password resets and the digest (465 = TLS) | Aaron's Gmail SMTP settings |
| `SMTP_PASS` | Mail password | **Aaron types this himself** (a Gmail app password). Never paste it into chat or docs |
| `SMTP_URL` | Optional single SMTP URL instead of the fields above | Leave unset |
| `MAIL_FROM` | Sender name and address | Aaron |
| `WEATHER_CRON_ENABLED` | Daily Open-Meteo rain check, 6:15 AM CT | Default **on**; only `false` turns it off |
| `DIGEST_CRON_ENABLED` | Weekly digest, Mondays 6:30 AM CT | Default off. **Keep `false`** until Aaron says otherwise |
| `DIGEST_SEASON_MONTHS` | Months the digest cron may send (e.g. `3-10`) | `.env.example` |
| `DIGEST_TEST_RECIPIENTS` | Allowlist for `POST /digest/send-test` | Use `aingalsbe@gmail.com` |
| `NODE_ENV` | `production` changes dev behavior (e.g. no dev reset URLs) | Not set in dev |
| `VITE_API_URL` (web) | API base path for the web app | `apps/web/.env.example` (`/api/v1`) |

To check which keys a `.env` has without showing values:

```powershell
Get-Content apps\api\.env | ForEach-Object { ($_ -split '=',2)[0] }
```

## 6. Install, start and stop

```powershell
cd C:\AIProjects\VineyardManager
pnpm install
pnpm db:generate
```

**Start everything:** `C:\AIProjects\Scripts\Start-VineyardManager.ps1`. It starts Docker Desktop if needed, waits for the engine, runs `docker compose up -d` (Postgres), opens one PowerShell window for the API (`pnpm dev` in `apps\api`) and one for the web app (`pnpm dev` in `apps\web`), then opens http://localhost:5173.

**Manual start:** `docker compose up -d`, then `pnpm dev:api` and `pnpm dev:web` in two windows (or `pnpm dev` for both through turbo).

**Stop:** close the API and web windows, then `docker compose down` (data stays in the `vineyard_pg` volume).
`Stop-VineyardManager.ps1` stops ports 5173/3001, but **by default it then runs the backup script** (commit + NAS + push). Use `Stop-VineyardManager.ps1 -SkipBackup` unless you mean to back up; add `-StopDocker` to also stop Postgres.

## 7. Database: migrate, seed, back up, restore

Postgres runs in Docker (user `vineyard`, database `vineyard_manager`, port 5432, volume `vineyard_pg`).

```powershell
pnpm db:migrate:deploy   # apply the existing migrations (new laptop)
pnpm db:seed             # demo data + dev logins (fresh DB only)
```

Use `pnpm db:migrate` (`prisma migrate dev`) only when writing a new migration. It may try to drop the `digest_logs_scheduled_once` partial index; delete that DROP INDEX line from the generated SQL.

**Dump the DB** (dumps inside the container, then copies out, so PowerShell can't mangle the file):

```powershell
docker compose exec postgres pg_dump -U vineyard -Fc -f /tmp/vineyard.dump vineyard_manager
docker compose cp postgres:/tmp/vineyard.dump .\vineyard.dump
```

**Restore** onto a migrated or empty DB:

```powershell
docker compose cp .\vineyard.dump postgres:/tmp/vineyard.dump
docker compose exec postgres pg_restore -U vineyard -d vineyard_manager --clean --if-exists /tmp/vineyard.dump
```

**NAS backup:** `C:\AIProjects\Scripts\Backup-VineyardManager.ps1`. It:

1. runs `git add -A` and commits if the tree is dirty, unless you pass `-SkipCommit`
2. mirrors files with robocopy to `N:\AIProjects\VineyardManager`, skipping `node_modules`, `.git`, `dist`, `.turbo`, `*.log` and `.env`
3. pushes `main` to `nas` (`N:\AIProjects\VineyardManager.git`) and to `origin` (GitHub)

It does **not** dump the database. Take a `pg_dump` (above) and keep it with the NAS copy if you need the data. Restoring from the NAS: clone from `N:\AIProjects\VineyardManager.git` (or copy the mirror), recreate the `.env` files, then restore a dump.

## 8. URLs, ports and dev logins

| What | Where |
| --- | --- |
| Web app (Vite) | http://localhost:5173 (proxies `/api` to 3001) |
| API | http://localhost:3001, health at http://localhost:3001/api/v1/health |
| Postgres | localhost:5432 |

Dev logins from `prisma/seed.ts` (dev only), all with password `VineyardDev1!`:

- `owner@vineyard.local`: power user
- `manager@vineyard.local`: manager
- `viewer@vineyard.local`: viewer

(The old `VineyardManager_StartupSequence.txt` says the API is "usually on port 3000"; it's actually **3001**.)

## 9. Cron flags

- `DIGEST_CRON_ENABLED=false`: keep it **off**. The API logs `[digest] weekly digest cron disabled`.
- `WEATHER_CRON_ENABLED`: **on unless set to `false`**. It runs the daily Open-Meteo rain check at 6:15 AM CT, which can log watering activities. The API logs `[weather] daily rain cron disabled` when it's off.

## 10. Verify checklist

- [ ] `docker ps` shows `vineyardmanager-postgres-1` on 5432
- [ ] http://localhost:3001/api/v1/health responds
- [ ] http://localhost:5173 loads and `owner@vineyard.local` can sign in (seeded DB)
- [ ] The API log shows the digest cron disabled
- [ ] `pnpm typecheck` and `pnpm lint` pass
- [ ] `git -C C:\AIProjects status` shows no `.env` files

## Common problems

| Problem | Fix |
| --- | --- |
| Docker not running / `docker info` fails | Open Docker Desktop and wait for "Engine running", then rerun the start script |
| Port in use (5173, 3001 or 5432) | `Get-NetTCPConnection -LocalPort 3001` to find the owner; stop it, or an older Postgres with `docker compose down` |
| "Container name ... is already in use" | `docker compose up -d --force-recreate` |
| Prisma client errors after pulling | `pnpm install` then `pnpm db:generate` |
| Login fails on a new DB | Run `pnpm db:migrate:deploy` then `pnpm db:seed`, or restore a dump |
| No reset emails | SMTP values missing in `apps/api/.env`. In dev the reset URL is logged instead |
