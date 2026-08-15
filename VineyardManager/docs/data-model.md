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

## Vineyard

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| ownerId | UUID | FK → User (power user) |
| name | string | |
| address | string | weather + calendar seeding |
| lat / lng | decimal? | map center |
| timezone | IANA string | |
| healthThresholds | JSON | custom color cutoffs |
| createdAt / updatedAt | timestamptz | |
| deletedAt | timestamptz? | |

## Block (parcel)

Optional grouping of rows (irrigation zone, hillside, named block). Persisted in `blocks`. Unique `(vineyardId, code)`.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| vineyardId | UUID | FK → Vineyard |
| code | string | unique per vineyard |
| name | string | |
| notes | string? | |
| createdAt / updatedAt | timestamptz | |
| deletedAt | timestamptz? | |

## Variety

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| vineyardId | UUID | FK |
| name | string | e.g. Norton, Chardonel |
| source | `manual` \| `auto_lookup` | |
| characteristics | JSON | water needs, prune window, pests |
| createdAt / updatedAt | timestamptz | |
| deletedAt | timestamptz? | |

## Row

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| vineyardId | UUID | FK |
| blockId | UUID? | FK → Block |
| code | string | `L1`, `S3` — unique per vineyard |
| label | string? | |
| vineCount | int | |
| spacingFt | decimal | |
| orientation | string? | N/S, E/W |
| varietyId | UUID? | primary variety; vines may override |
| sortOrder | int | map render order |
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

## Activity

The core write path.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| vineyardId | UUID | denormalized for queries |
| scopeType | `vineyard` \| `block` \| `row` \| `variety` \| `vine` | |
| scopeId | UUID | polymorphic |
| activityType | see shared constants | |
| performedAt | timestamptz | defaults to now |
| performedBy | UUID | FK → User |
| details | JSON | type-specific payload |
| source | `manual` \| `ai_suggested` \| `imported` | |
| createdAt / updatedAt | timestamptz | |
| deletedAt | timestamptz? | |

Activity `details` examples:

- Watering: `{ durationMin, method, volumeGal? }`
- Fertilization: `{ product, amountPerVine, unit }`
- Pest: `{ method, targetPests, product? }`
- Harvest: `{ weightLb, condition }`
- Observation: `{ pests, damage, notes }`

## Health snapshot

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

Persisted in `tasks`. Vineyard-wide when `blockId` is null; otherwise scoped to a block.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | PK |
| vineyardId | UUID | FK → Vineyard |
| blockId | UUID? | FK → Block; null = whole vineyard |
| userId | UUID? | FK → User; null = all eligible roles |
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
Vineyard 1──* Block 1──* Row 1──* Vine
Vineyard 1──* Variety
Vineyard 1──* Task
Block 1──* Task          (optional scope)
User 1──* Task           (optional assignee)
Row / Vine / Variety / Block *──* Activity (via scope)
Vineyard / Block / Row / Vine 1──* HealthSnapshot
```

Schema and migrations: `apps/api/prisma`. Initial migration covers User, Vineyard, Block, and Task.
