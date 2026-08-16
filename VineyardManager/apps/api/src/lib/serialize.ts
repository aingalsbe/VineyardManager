import type { Block, Vineyard } from "@prisma/client";
import type { Block as BlockDto, Vineyard as VineyardDto } from "@vineyard/shared";

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
    healthThresholds: row.healthThresholds as unknown as VineyardDto["healthThresholds"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export function serializeBlock(row: Block): BlockDto {
  return {
    id: row.id,
    vineyardId: row.vineyardId,
    code: row.code,
    name: row.name,
    variety: row.variety,
    acreage: Number(row.acreage.toString()),
    plantedYear: row.plantedYear,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
