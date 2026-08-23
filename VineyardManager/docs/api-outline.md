# API outline (v0.1)

REST-first. Auth: Bearer JWT (or session cookie for web). All endpoints require authentication unless noted.

Base path: `/api/v1`

List endpoints support `?page=&limit=&sort=` plus common filters. Errors:

```json
{ "error": { "code": "NOT_FOUND", "message": "Vineyard not found" } }
```

## Auth

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/register` | Create power user account |
| POST | `/auth/login` | Email + password → JWT |
| POST | `/auth/refresh` | Refresh token |
| POST | `/auth/logout` | Invalidate |
| GET | `/auth/me` | Current user + role |

## Vineyards

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards` | List vineyards the user can access |
| POST | `/vineyards` | Create (power user) |
| GET | `/vineyards/{id}` | Detail + current health summary |
| PATCH | `/vineyards/{id}` | Name, address, thresholds, prefs |
| DELETE | `/vineyards/{id}` | Soft-delete |

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
| POST | `/vineyards/{vid}/activities` | Create (`scopeType`, `scopeId`, `activityType`, `performedAt?`, `details`) |
| GET | `/activities/{id}` | Detail |
| DELETE | `/activities/{id}` | Soft-delete |

## Health and dashboard

| Method | Path | Description |
| --- | --- | --- |
| GET | `/vineyards/{vid}/health` | Overall + per-row color map + reasons |
| GET | `/rows/{id}/health` | Row + vine scores |
| POST | `/vineyards/{vid}/health/recalculate` | Rule engine + optional assistant pass |

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
