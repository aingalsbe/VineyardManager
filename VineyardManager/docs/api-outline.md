# API outline (v0.1)

REST-first. Auth: Bearer JWT (or session cookie for web). All endpoints require authentication unless noted.

Base path: `/api/v1`

List endpoints support `?page=&limit=&sort=` plus common filters. Errors:

```json
{ "error": { "code": "NOT_FOUND", "message": "Vineyard not found" } }
```

## Auth

Bearer JWT (`Authorization: Bearer <token>`). All `/api/v1/*` routes require auth except `GET /health` and `POST /auth/login`.

Shipped:

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/login` | Email + password → `{ data: { token, user } }`. Public. Invalid credentials: `401 UNAUTHORIZED` “Invalid email or password” |
| POST | `/auth/logout` | Stateless JWT: `{ data: { ok: true } }`. Client discards the token |
| GET | `/auth/me` | Current user `{ id, email, displayName, role }` (never `passwordHash`) |

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
| PATCH | `/vineyards/{id}` | Name, address, timezone, optional lat/lng, `rowLayout` |
| PUT | `/vineyards/{id}/logo` | Multipart field `file` (PNG/JPEG/WebP, ≤1 MB) |
| GET | `/vineyards/{id}/logo` | Image bytes. Auth required. `404` if none |
| DELETE | `/vineyards/{id}/logo` | Remove file + clear fields |

Out of this slice:

| Method | Path | Description |
| --- | --- | --- |
| DELETE | `/vineyards/{id}` | Soft-delete (future) |

## Varieties

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/varieties` | List |
| POST | `/vineyards/{vid}/varieties` | Add (optional auto-lookup) |
| GET | `/varieties/{id}` | Detail |
| PATCH | `/varieties/{id}` | Update |
| DELETE | `/varieties/{id}` | Soft-delete |

## Rows and vines

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/rows` | List rows (length, vine count, variety, status) |
| POST | `/vineyards/{vid}/rows` | Create row |
| PATCH | `/vineyards/{vid}/rows/{id}` | Update row fields |
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

Out of this slice:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/rows/{id}/health` | Row + vine scores (future) |
| POST | `/vineyards/{vid}/health/recalculate` | Persist / AI pass (future) |

## Assistant

| Method | Path | Description |
| --- | --- | --- |
| POST | `/vineyards/{vid}/assistant/analyze` | State → suggestions / rationale |
| POST | `/vineyards/{vid}/assistant/suggest-schedule` | Next maintenance window |
| GET | `/vineyards/{vid}/assistant/history` | Past interactions |

## Tasks

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/tasks` | List tasks (`?rowId=` `?status=`) |
| POST | `/vineyards/{vid}/tasks` | Create task (optional `rowId`) |
| PATCH | `/vineyards/{vid}/tasks/{id}` | Edit fields or change status |

## Notifications and schedule

| Method | Path | Description |
| --- | --- | --- |
| GET | `/notifications` | Pending + recent |
| PATCH | `/notifications/{id}` | Acknowledge / dismiss |
| GET | `/vineyards/{vid}/schedule` | Upcoming calculated tasks |
| POST | `/vineyards/{vid}/schedule/seed` | Seed annual calendar from address + varieties |

## Weather

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/weather` | Current + 7-day + alerts (cached) |
| GET | `/vineyards/{vid}/weather/history` | Rain / extremes for calculations |

## Offline sync

| Method | Path | Description |
| --- | --- | --- |
| POST | `/sync/push` | Client pushes offline-created activities |
| GET | `/sync/pull` | Changes since cursor |

## Users (power user)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/users` | Managers + viewers |
| POST | `/vineyards/{vid}/users` | Invite by email + role |
| PATCH | `/vineyards/{vid}/users/{uid}` | Change role |
| DELETE | `/vineyards/{vid}/users/{uid}` | Remove access |
