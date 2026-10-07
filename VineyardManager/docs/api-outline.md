# API outline (v0.1)

REST-first. Auth: Bearer JWT (or session cookie for web). All endpoints require authentication unless noted.

Base path: `/api/v1`

List endpoints support `?page=&limit=&sort=` plus common filters. Errors:

```json
{ "error": { "code": "NOT_FOUND", "message": "Vineyard not found" } }
```

## Auth

Bearer JWT (`Authorization: Bearer <token>`). All `/api/v1/*` routes require auth except `GET /health`, `POST /auth/login`, `POST /auth/forgot-password`, and `POST /auth/reset-password`.

Writes check the JWT `role`. **Operate** (`manager` | `power_user`): activities, harvests, tasks, rows. **Setup** (`power_user` only): vineyard create/PATCH, logo, calendar seed, people admin. Viewers get `403 FORBIDDEN` `{ "error": { "code": "FORBIDDEN", "message": "Your role cannot change this." } }` on writes. GETs stay any signed-in user except people admin (power_user only). Soft-deleted or disabled users cannot log in and cannot use an existing token (`401 UNAUTHORIZED`).

Shipped:

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/login` | Email + password â†’ `{ data: { token, user } }`. Public. Invalid credentials: `401 UNAUTHORIZED` â€œInvalid email or passwordâ€ |
| POST | `/auth/logout` | Stateless JWT: `{ data: { ok: true } }`. Client discards the token |
| GET | `/auth/me` | Current user `{ id, email, displayName, role, disabledAt }` (never `passwordHash`) |
| PATCH | `/auth/me` | Own `{ displayName?, email? }`. Never role/password. `409 EMAIL_TAKEN` if another live user has the email |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` (min 10). Wrong current: `401 INVALID_CREDENTIALS` |
| POST | `/auth/forgot-password` | Public. `{ email }` â†’ always `{ data: { ok: true } }`. Development also may include `devResetUrl`. Disabled/unknown emails still return ok and send nothing |
| POST | `/auth/reset-password` | Public. `{ token, newPassword }`. Invalid/expired/used: `400 RESET_INVALID`. Does not re-enable a disabled account |

Out of this slice:

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/register` | Not shipped (no public self-serve signup) |
| POST | `/auth/refresh` | Not shipped (access token lives 7d; no rotation) |

## Vineyards

One working vineyard for now. `GET /vineyards` is still the list; the web uses the first row.

Shipped:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards` | List (`hasLogo`, `rowLayout` on each; never `logoPath`) |
| POST | `/vineyards` | Create (name, address, timezone). `409 CONFLICT` if one already exists |
| GET | `/vineyards/{id}` | Detail |
| PATCH | `/vineyards/{id}` | Name, address, timezone, optional lat/lng, `rowLayout`, `healthThresholds`, `varietyCatalog` |
| PUT | `/vineyards/{id}/logo` | Multipart field `file` (PNG/JPEG/WebP, â‰¤1 MB) |
| GET | `/vineyards/{id}/logo` | Image bytes. Auth required. `404` if none |
| DELETE | `/vineyards/{id}/logo` | Remove file + clear fields |

Out of this slice:

| Method | Path | Description |
| --- | --- | --- |
| DELETE | `/vineyards/{id}` | Soft-delete (future) |

## Varieties

Names are `varietyCatalog` on the vineyard (PATCH above). Row.variety stays a string.

Out of this slice (no Variety table):

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/varieties` | Future catalog entity |
| POST | `/vineyards/{vid}/varieties` | Future + auto-lookup |

## Rows and vines

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/rows` | List rows (length, vine count, variety, status) |
| POST | `/vineyards/{vid}/rows` | Create row |
| PATCH | `/vineyards/{vid}/rows/{id}` | Partial update (operate). Any subset of row fields; sent fields validated; `{}` → `400 Enter at least one field` |
| GET | `/vineyards/{vid}/rows/{id}/delete-preview` | Operate (viewer `403`). `404 NOT_FOUND` if row missing or already deleted. Same helper as DELETE (`rows/row-delete.ts`). `200 { data: { rowId, code, mode: "soft"\|"hard", counts: { tasks, openTasks, harvests, activities }, openTasks: [{ id, title, dueDate, status }], message } }` |
| DELETE | `/vineyards/{vid}/rows/{id}` | Operate (viewer `403`). Option `openTasks: "keep" \| "dismiss"` via `?openTasks=` and/or JSON body (default `keep`; other values or query/body mismatch → `400 VALIDATION_ERROR`). Row with any task/harvest/activity (incl. soft-deleted): **soft** — `deletedAt`, `status: retired`, code → `<code>__old_<id8>`; history kept. No references: **hard** delete. `dismiss` sets live `pending`/`sent` tasks on the row to `dismissed` in the same transaction (closed tasks untouched). Both drop the row from `rowLayout`. `200 { data: { id, mode, message, openTasks, dismissedTaskCount, counts, row? } }`; `404 NOT_FOUND` |

Row delete details:

- `counts.tasks` / `harvests` / `activities` include soft-deleted records (they are history and decide soft vs hard). `counts.openTasks` = live tasks with status `pending` or `sent`.
- `openTasks[].dueDate` is `YYYY-MM-DD` in the vineyard time zone, sorted by due date.
- `message` is identical in preview and DELETE (does not depend on `openTasks`; use `dismissedTaskCount`). Hard: `Row ZZA deleted.` Soft: `Row NS5 removed. Its history (1 task, 0 harvests, 2 activities) is kept and will show as "Removed row".`
- Kept open tasks on a removed row stay open work: the Dashboard counts/lists them (label "Removed row"); health never scores them against a row but lists them as vineyard-level reasons (`Removed row: Overdue: …`).
| GET | `/rows/{id}/vines` | List vines |
| POST | `/rows/{id}/vines` | Add vine |
| PATCH | `/vines/{id}` | Variety, status, notes |

## Harvests

First-class harvest records (not Activities). `vineyardId` is copied from the row on create.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/harvests` | List (`?rowId=` optional) |
| GET | `/harvests/{id}` | Detail |
| POST | `/harvests` | Create (`rowId`, date, yield, unit, notes, crew) |
| PATCH | `/harvests/{id}` | Update fields |
| DELETE | `/harvests/{id}` | Soft-delete |

## Activities

Work log (not Harvests). Scope for this slice is **vineyard** or **row** only.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/activities` | List (`?rowId=` `?activityType=` `?scopeType=`), newest first |
| POST | `/vineyards/{vid}/activities` | Create (`scopeType`, `scopeId`, `activityType`, `performedAt?`, `details`). `performedBy` is the signed-in user |
| GET | `/activities/{id}` | Detail |
| DELETE | `/activities/{id}` | Soft-delete |

## Health and dashboard

Computed on the fly from rows, tasks, and activities. No HealthSnapshot persistence this slice.

Shipped:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/health` | `{ data: { vineyardId, asOf, overall: { score, color, reasons }, rows: [...] } }`. Optional `?asOf=YYYY-MM-DD`. Auth required. |
| GET | `/vineyards/{vid}/metrics` | Computed health series, harvest YoY (lb), and activity counts. `?period=month\|quarter\|year` (default `year`). Optional `?asOf=YYYY-MM-DD`. Variety rollups sum rows that share `Row.variety`. No HealthSnapshot. |

Out of this slice:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/rows/{id}/health` | Row + vine scores (future) |
| POST | `/vineyards/{vid}/health/recalculate` | Persist / AI pass (future) |

## Assistant

| Method | Path | Description |
| --- | --- | --- |
| POST | `/vineyards/{vid}/assistant/analyze` | State â†’ suggestions / rationale |
| POST | `/vineyards/{vid}/assistant/suggest-schedule` | Next maintenance window |
| GET | `/vineyards/{vid}/assistant/history` | Past interactions |

## Tasks

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/tasks` | List tasks (`?rowId=` `?status=`) |
| POST | `/vineyards/{vid}/tasks` | Create task (optional `rowId`) |
| PATCH | `/vineyards/{vid}/tasks/{id}` | Edit fields or change status |
| DELETE | `/vineyards/{vid}/tasks/{id}` | Soft-delete (operate). `200 { data: task }`; `404 NOT_FOUND`; viewer `403`. Task `row` ref includes `deletedAt` (removed rows) |

## Notifications and schedule

Shipped:

| Method | Path | Description |
| --- | --- | --- |
| POST | `/vineyards/{vid}/schedule/seed` | Idempotent annual maintenance tasks for the current year. `{ created, skipped, tasks }` |

Out of this slice:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/notifications` | Pending + recent |
| PATCH | `/notifications/{id}` | Acknowledge / dismiss |
| GET | `/vineyards/{vid}/schedule` | Upcoming calculated tasks |

## Weather

Location for weather and rain checks comes from the vineyard record (`lat` / `lng`, else geocode `address` and persist coordinates). Rain threshold (daily-check only): **0.5 inches** in the past rolling **24 hours** (Open-Meteo, inches). On trigger: one vineyard-scoped `watering` Activity with `source: "weather"` (idempotent per vineyard + local calendar date). No Dashboard rain-check button — automated via in-process cron at **6:15 AM America/Chicago** (`WEATHER_CRON_ENABLED`, default on).

**Cache TTL:** `GET /weather` and `GET /weather/history` cache in-process for **15 minutes** (`weather.cache.ts`). Response includes `cached` and `cacheExpiresAt`.

**Alerts:** Open-Meteo has **no** full NWS / CAP alert feed. `alerts` is always an array (never null). Entries are **derived** frost / wind / heavy rain / snow / drought proxies from forecast (+ archive for drought), and a weak hail proxy from WMO codes 96/99. Official **tornado** (and most hail) watches/warnings are **not** available from this provider — those hazards stay empty unless a future NWS integration is added. `source` is `"derived"` today (`"nws"` / `"open-meteo"` reserved).

Errors: `404 NOT_FOUND`, `422 LOCATION_UNRESOLVED`, `502 WEATHER_UNAVAILABLE`.

Shipped:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/weather` | Current + 7-day `daily` + `alerts`. Auth: any signed-in user (viewer+). Cached 15 min. |
| GET | `/vineyards/{vid}/weather/history` | Recent daily precip / temps / wind. `?days=1..90` (default **14**). Auth: viewer+. Cached 15 min. |
| POST | `/vineyards/{vid}/weather/daily-check` | Run rain check now (`requireOperate`). Creates watering Activity when ≥0.5". Idempotent same local day. Optional body `{ forceRainInches }` for QA. |

### `GET /weather` response shape (`{ data }`)

```ts
{
  vineyardId, timeZone, lat, lng, geocoded,
  provider: "open-meteo",
  fetchedAt, cached, cacheExpiresAt,
  current: {
    observedAt, tempF, feelsLikeF, humidityPct, precipInches,
    windMph, windGustMph, weatherCode, summary
  },
  daily: Array<{ // length 7
    date, tempMaxF, tempMinF, precipInches, precipProbabilityPct,
    windMphMax, weatherCode, summary
  }>,
  alerts: Array<{ // never null; may be []
    id,
    hazard: "hail" | "wind" | "tornado" | "rain" | "snow" | "frost" | "drought",
    severity: "minor" | "moderate" | "severe" | "extreme",
    title, description, startsAt, endsAt,
    source: "nws" | "open-meteo" | "derived"
  }>
}
```

### `GET /weather/history` response shape (`{ data }`)

```ts
{
  vineyardId, timeZone,
  provider: "open-meteo",
  fetchedAt, cached, cacheExpiresAt,
  days: Array<{ date, precipInches, tempMaxF, tempMinF, windMphMax }>
}
```


## Offline sync

| Method | Path | Description |
| --- | --- | --- |
| POST | `/sync/push` | Client pushes offline-created activities |
| GET | `/sync/pull` | Changes since cursor |

## Users (power user)

Shipped. All four routes: `requireAuth` + `requireSetup` + vineyard exists. No outbound email. No membership table â€” role lives on `User`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/users` | List people (`deletedAt` null, including disabled). `{ data: PublicUser[] }`. Sort: role then displayName. Optional `?includeDeleted=1` |
| POST | `/vineyards/{vid}/users` | Invite `{ email, displayName, role }`. Response once: `{ data: { user, temporaryPassword } }`. Live email â†’ `409 USER_EXISTS`. Soft-deleted email is restored with a new temp password |
| PATCH | `/vineyards/{vid}/users/{uid}` | `{ role?, disabled?, displayName? }`. `disabled: true` sets `disabledAt`. Cannot change self, owner, or the last enabled power user |
| DELETE | `/vineyards/{vid}/users/{uid}` | Soft-delete (`deletedAt` + `disabledAt`). Same guards as PATCH. `{ data: { ok: true } }` |

`PublicUser` is `{ id, email, displayName, role, disabledAt }`. Never `passwordHash`. Temporary password is never echoed on GET/PATCH.
