import type { Activity, Harvest, Row, Task, User, Vineyard } from "@prisma/client";
import type {
  Activity as ActivityDto,
  ActivityScope,
  ActivitySource,
  Harvest as HarvestDto,
  PublicUser,
  Row as RowDto,
  ScheduledTask,
  Vineyard as VineyardDto,
} from "@vineyard/shared";

function decimalToNumber(value: { toString(): string } | null): number | null {
  if (value == null) return null;
  return Number(value.toString());
}

export function serializePublicUser(
  user: Pick<User, "id" | "email" | "displayName" | "role">,
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export function serializeVineyard(row: Vineyard): VineyardDto {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    address: row.address,
    lat: decimalToNumber(row.lat),
    lng: decimalToNumber(row.lng),
    timezone: row.timezone,
    healthThresholds:
      row.healthThresholds as unknown as VineyardDto["healthThresholds"],
    hasLogo: Boolean(row.logoPath),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export function serializeRow(record: Row): RowDto {
  return {
    id: record.id,
    vineyardId: record.vineyardId,
    code: record.code,
    name: record.name,
    variety: record.variety,
    lengthFeet: record.lengthFeet,
    lengthInches: record.lengthInches,
    vineCount: record.vineCount,
    plantedYear: record.plantedYear,
    status: record.status,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
  };
}

export function serializeTask(
  record: Task & {
    row?: { id: string; code: string; name: string } | null;
  },
): ScheduledTask {
  return {
    id: record.id,
    vineyardId: record.vineyardId,
    rowId: record.rowId,
    userId: record.userId,
    type: record.type,
    title: record.title,
    body: record.body,
    dueAt: record.dueAt.toISOString(),
    status: record.status,
    relatedActivityType: record.relatedActivityType,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
    row: record.row ?? null,
  };
}

export function serializeHarvest(
  record: Harvest & {
    row?: { id: string; code: string; name: string } | null;
  },
): HarvestDto {
  return {
    id: record.id,
    rowId: record.rowId,
    vineyardId: record.vineyardId,
    harvestedAt: record.harvestedAt.toISOString(),
    yieldAmount: Number(record.yieldAmount.toString()),
    yieldUnit: record.yieldUnit,
    notes: record.notes,
    crew: record.crew,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
    row: record.row ?? null,
  };
}

export function serializeActivity(
  record: Activity & {
    row?: { id: string; code: string; name: string } | null;
  },
  performedByDisplayName?: string | null,
): ActivityDto {
  return {
    id: record.id,
    vineyardId: record.vineyardId,
    rowId: record.rowId,
    scopeType: record.scopeType as ActivityScope,
    scopeId: record.scopeId,
    activityType: record.activityType,
    performedAt: record.performedAt.toISOString(),
    performedBy: record.performedBy,
    performedByDisplayName: performedByDisplayName ?? null,
    details: record.details as ActivityDto["details"],
    source: record.source as ActivitySource,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
    row: record.row ?? null,
  };
}
