import type { Row, Task, Vineyard } from "@prisma/client";
import type {
  Row as RowDto,
  ScheduledTask,
  Vineyard as VineyardDto,
} from "@vineyard/shared";

function decimalToNumber(value: { toString(): string } | null): number | null {
  if (value == null) return null;
  return Number(value.toString());
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
