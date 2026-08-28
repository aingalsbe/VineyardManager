import type { RowLayout } from "./types.js";

/** Matches the Dashboard schematic in VineyardHealthMap (column/row grid). */
export const DEFAULT_ROW_GRID_LAYOUT: Record<
  string,
  { column: number; row: number }
> = {
  S1: { column: 2, row: 1 },
  L1: { column: 1, row: 2 },
  S3: { column: 3, row: 2 },
  L2: { column: 2, row: 3 },
  S2: { column: 2, row: 4 },
  L3: { column: 2, row: 5 },
};

export const LAYOUT_CANVAS = { width: 720, height: 480 } as const;
export const BAR_THICKNESS_PX = 32;
const CELL_W = 220;
const CELL_H = 82;
const PAD_X = 30;
const PAD_Y = 28;
const UNITS_PER_VINE = 9;
const MIN_BAR_PX = 56;

export function gridSlotToCanvas(
  column: number,
  gridRow: number,
): { x: number; y: number } {
  return {
    x: PAD_X + (column - 0.5) * CELL_W,
    y: PAD_Y + (gridRow - 0.5) * CELL_H,
  };
}

export function layoutFromDefaultGrid(
  rows: Array<{ id: string; code: string }>,
): RowLayout {
  return {
    version: 1,
    rows: rows.flatMap((row) => {
      const slot = DEFAULT_ROW_GRID_LAYOUT[row.code];
      if (!slot) return [];
      const { x, y } = gridSlotToCanvas(slot.column, slot.row);
      return [{ rowId: row.id, x, y, rotationDeg: 0 }];
    }),
  };
}

export function barLengthPx(
  vineCount: number,
  lengthFeet = 0,
  lengthInches = 0,
): number {
  if (vineCount > 0) return Math.max(MIN_BAR_PX, vineCount * UNITS_PER_VINE);
  const feet = lengthFeet + lengthInches / 12;
  if (feet > 0) return Math.max(MIN_BAR_PX, feet * 0.9);
  return MIN_BAR_PX;
}

export function snapRotationDeg(degrees: number, step = 15): number {
  const normalized = ((degrees % 360) + 360) % 360;
  return Math.round(normalized / step) * step;
}
