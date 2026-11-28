# Data model (v0.1)

Prefer explicit foreign keys, soft deletes, and audit timestamps. UUIDs for all primary keys. JSONB (or equivalent typed JSON) for details that will change while features evolve.

## User

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| email | string | unique |
| passwordHash | string | or external auth id |
| displayName | string | |
| role | `power_user` \| `manager` \| `viewer` | |
| notificationPrefs | JSON | frequency, channels, thresholds |
| createdAt / updatedAt | timestamptz | |
| deletedAt | timestamptz? | soft delete |
| disabledAt | timestamptz? | set when a power user disables the account; login and existing tokens fail |

## Vineyard

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| ownerId | UUID | FK → User (power user) |
| name | string | |
| address | string | weather + calendar seeding |
| lat / lng | decimal? | map center |
| timezone | IANA string | |
| healthThresholds | JSON | custom color cutoffs `{ greenMin, yellowMin, orangeMin }` |
| varietyCatalog | JSON | string[] of grape names (not a Variety table) |
| varietyHarvestTags | JSON | `{ [varietyName]: "early" \| "mid" \| "late" }`, default `{}` (confirmed by user) |
| rowLayout | JSON? | `{ version: 1, rows: [{ rowId, x, y, rotationDeg }] }` |
| logoPath | string? | API-only; file on disk |
| logoContentType | string? | `image/png` \| `image/jpeg` \| `image/webp` |
| createdAt / updatedAt | timestamptz | |
| deletedAt | timestamptz? | |

Public vineyard JSON includes `hasLogo` and never `logoPath`.

## Block (parcel)

Optional future grouping of rows (irrigation zone, hillside). Not persisted yet.

## Variety

Not a table yet. Names live on `Vineyard.varietyCatalog`, confirmed harvest bands on `Vineyard.varietyHarvestTags`, and row variety as a string on each `Row.variety`.

## Row

Persisted in `rows`. Unique `(vineyardId, code)`. Codes like `L1` / `S3`.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| vineyardId | UUID | FK → Vineyard |
| code | string | `L1`, `S3` — unique per vineyard |
| name | string | |
| variety | string | primary grape |
| lengthFeet | int | row length, feet |
| lengthInches | int | 0–11 leftover inches |
| vineCount | int | whole number of vines on the row |
| plantedYear | int | first planting year |
| status | `active` \| `fallow` \| `replanting` \| `retired` | |
| preDeleteCode | string? | recorded on soft delete for restore |
| preDeleteStatus | RowStatus? | recorded on soft delete for restore (fallback `active`) |
| notes | string? | |
| createdAt / updatedAt | timestamptz | |
| deletedAt | timestamptz? | |

## Vine

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| rowId | UUID | FK |
| position | int | 1-based in row |
| varietyId | UUID | may differ from row default |
| plantedAt | date? | |
| status | `active` \| `replaced` \| `removed` | |
| notes | string? | |
| createdAt / updatedAt | timestamptz | |
| deletedAt | timestamptz? | |

## Season

Persisted in `seasons`. Unique `(vineyardId, year)` plus partial unique indexes `seasons_one_active_per_vineyard` and `seasons_one_planned_per_vineyard`.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| vineyardId | UUID | FK → Vineyard (RESTRICT) |
| year | int | calendar year in vineyard timezone |
| status | `legacy` \| `active` \| `planned` \| `closed` | |
| startedAt / closedAt / reopenedAt | timestamptz? | `reopenableUntil = closedAt + 30 days` (computed) |
| startedBy / closedBy | UUID? | actor user id |
| closeVersion | int | default `0`; incremented on each close |
| snapshot | JSONB? | frozen `SeasonSnapshot` (`schemaVersion: 1`), cleared on reopen |
| summary | JSONB? | rule-based `SeasonSummary` built from snapshot, moved to `summaryHistory` on reopen |
| summaryHistory | JSONB | array of prior `SeasonSummary` objects, default `[]` |
| createdAt / updatedAt | timestamptz | |

## SeasonSummaryMail

Persisted in `season_summary_mails`. Composite RESTRICT FK `(season_id, vineyard_id)` → `seasons(id, vineyard_id)`; unique `(season_id, close_version, recipient_email)`.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| seasonId / vineyardId | UUID | composite FK → Season |
| closeVersion | int | matches `Season.closeVersion` at enqueue time |
| userId | UUID? | FK → User (`ON DELETE SET NULL`) |
| recipientEmail | text | normalized lower-case email |
| status | `pending` \| `sent` \| `failed` \| `skipped` | |
| attempts | int | default `0`; bounded retry loop |
| lastErrorCode | text? | allowlisted code only (never raw provider text) |
| providerMessageId | text? | provider id when sent |
| createdAt / sentAt | timestamptz | |

## Activity

The core write path.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| vineyardId | UUID | denormalized for queries |
| seasonId | UUID? | composite FK → `seasons(id, vineyard_id)` RESTRICT |
| scopeType | `vineyard` \| `block` \| `row` \| `variety` \| `vine` | |
| scopeId | UUID | polymorphic |
| activityType | see shared constants | |
| performedAt | timestamptz | defaults to now |
| performedBy | UUID | FK → User |
| details | JSON | type-specific payload |
| source | `manual` \| `ai_suggested` \| `imported` \| `weather` | immutable on PATCH |
| createdAt / updatedAt | timestamptz | |
| deletedAt | timestamptz? | |

Activity `details` examples:

- Watering: `{ durationMin, method, volumeGal? }`
- Fertilization: `{ product, amountPerVine, unit }`
- Pest: `{ method, targetPests, product? }`
- Harvest: `{ weightLb, condition }`
- Observation: `{ pests, damage, notes }`

## Health snapshot

Not persisted. Dashboard health and Metrics trends call `scoreRowHealth` / `scoreVineyardHealth` with `asOf`. Metrics `GET /vineyards/{id}/metrics` aggregates harvests (lb; kg converted) and activities live (optional `?seasonId=`). Variety charts sum rows that share the same `Row.variety` string.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| vineyardId / rowId / vineId / blockId | UUID | at least one |
| score | int | 0–100 |
| color | `green` \| `yellow` \| `orange` \| `red` | |
| reasons | JSON | contributing factors |
| calculatedAt | timestamptz | |
| calculatedBy | `rule_engine` \| `ai_assistant` | |

## Scheduled task / notification

Persisted in `tasks`. Vineyard-wide when `rowId` is null; otherwise scoped to a row. Partial unique index `tasks_season_template_key_live_unique` on `(season_id, template_key) WHERE template_key IS NOT NULL AND deleted_at IS NULL` enforces per-season calendar idempotency.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| vineyardId | UUID | FK → Vineyard |
| seasonId | UUID? | composite FK → `seasons(id, vineyard_id)` RESTRICT |
| rowId | UUID? | FK → Row; null = whole vineyard |
| userId | UUID? | FK → User; null = all eligible roles |
| templateKey | text? | stable calendar template identifier |
| type | `maintenance` \| `weather` \| `health_summary` | |
| title / body | string | |
| dueAt | timestamptz | |
| status | `pending` \| `sent` \| `acknowledged` \| `dismissed` | |
| relatedActivityType | activity type enum? | |
| createdAt / updatedAt | timestamptz | |
| deletedAt | timestamptz? | |

## Relationships

```text
User 1──* Vineyard
Vineyard 1──* Row 1──* Vine
Vineyard 1──* Season 1──* SeasonSummaryMail
Season 1──* Task / Harvest / Activity
Vineyard 1──* Task
Row 1──* Task            (optional scope)
User 1──* Task           (optional assignee)
Row / Vine / Variety *──* Activity (via scope)
```

Schema and migrations: `apps/api/prisma`. Live tables: User, PasswordResetToken, Vineyard, Row, Season, SeasonSummaryMail, Task, Harvest, Activity, DigestLog.
