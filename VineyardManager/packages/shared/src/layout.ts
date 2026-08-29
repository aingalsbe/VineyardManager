import type { RowLayout, RowLayoutPlacement } from "./types.js";

export const BAR_THICKNESS_PX = 32;
export const LAYOUT_CANVAS = { width: 720, height: 480 } as const;
const UNITS_PER_VINE = 9;
const MIN_BAR_PX = 56;

/** Old seed codes → NS/EW. Positions stay the same. */
export const LEGACY_ROW_CODES: Record<string, string> = {
  L1: "NS1",
  L2: "NS2",
  L3: "NS3",
  L4: "NS4",
  S1: "EW1",
  S2: "EW2",
  S3: "EW3",
  S4: "EW4",
  S5: "EW5",
  S6: "EW6",
  S7: "EW7",
  S8: "EW8",
  S9: "EW9",
  S10: "EW10",
  S11: "EW11",
};

/** 4 N–S (vertical) + 11 E–W (horizontal). Coordinates are bar centers. */
export const DEFAULT_ROW_PLACEMENT: Record<
  string,
  { x: number; y: number; rotationDeg: number }
> = {
  NS1: { x: 48, y: 140, rotationDeg: 90 },
  NS2: { x: 92, y: 140, rotationDeg: 90 },
  NS3: { x: 136, y: 140, rotationDeg: 90 },
  NS4: { x: 180, y: 140, rotationDeg: 90 },
  EW1: { x: 340, y: 36, rotationDeg: 0 },
  EW2: { x: 340, y: 72, rotationDeg: 0 },
  EW3: { x: 340, y: 108, rotationDeg: 0 },
  EW4: { x: 340, y: 144, rotationDeg: 0 },
  EW5: { x: 340, y: 180, rotationDeg: 0 },
  EW6: { x: 340, y: 216, rotationDeg: 0 },
  EW7: { x: 340, y: 252, rotationDeg: 0 },
  EW8: { x: 340, y: 288, rotationDeg: 0 },
  EW9: { x: 340, y: 324, rotationDeg: 0 },
  EW10: { x: 340, y: 360, rotationDeg: 0 },
  EW11: { x: 340, y: 396, rotationDeg: 0 },
};

/** @deprecated Use DEFAULT_ROW_PLACEMENT. Kept so Reset still finds every seed code. */
export const DEFAULT_ROW_GRID_LAYOUT: Record<
  string,
  { column: number; row: number }
> = {
  NS1: { column: 1, row: 1 },
  NS2: { column: 2, row: 1 },
  NS3: { column: 3, row: 1 },
  NS4: { column: 4, row: 1 },
  EW1: { column: 6, row: 1 },
  EW2: { column: 6, row: 2 },
  EW3: { column: 6, row: 3 },
  EW4: { column: 6, row: 4 },
  EW5: { column: 6, row: 5 },
  EW6: { column: 6, row: 6 },
  EW7: { column: 6, row: 7 },
  EW8: { column: 6, row: 8 },
  EW9: { column: 6, row: 9 },
  EW10: { column: 6, row: 10 },
  EW11: { column: 6, row: 11 },
};

export function rowLengthFromPlanting(input: {
  vineCount: number;
  spacingFt?: number;
  endInsetFt?: number;
}): { lengthFeet: number; lengthInches: number } {
  const spacingFt = input.spacingFt ?? 7;
  const endInsetFt = input.endInsetFt ?? 3.5;
  const totalFt =
    input.vineCount <= 0
      ? 0
      : 2 * endInsetFt + (input.vineCount - 1) * spacingFt;
  const totalInches = Math.round(totalFt * 12);
  return {
    lengthFeet: Math.floor(totalInches / 12),
    lengthInches: totalInches % 12,
  };
}

export function layoutFromDefaultGrid(
  rows: Array<{ id: string; code: string }>,
): RowLayout {
  return {
    version: 1,
    rows: rows.flatMap((row) => {
      const mapped = LEGACY_ROW_CODES[row.code] ?? row.code;
      const slot = DEFAULT_ROW_PLACEMENT[mapped];
      if (!slot) return [];
      return [
        {
          rowId: row.id,
          x: slot.x,
          y: slot.y,
          rotationDeg: slot.rotationDeg,
        },
      ];
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

export function layoutViewBox(
  placements: Array<Pick<RowLayoutPlacement, "x" | "y" | "rotationDeg">>,
  lengths: number[],
  padding = 28,
): { x: number; y: number; width: number; height: number } {
  if (placements.length === 0) {
    return { x: 0, y: 0, width: LAYOUT_CANVAS.width, height: 360 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    if (!placement) continue;
    const length = lengths[index] ?? MIN_BAR_PX;
    const rad = (placement.rotationDeg * Math.PI) / 180;
    const halfX =
      (length / 2) * Math.abs(Math.cos(rad)) +
      (BAR_THICKNESS_PX / 2) * Math.abs(Math.sin(rad));
    const halfY =
      (length / 2) * Math.abs(Math.sin(rad)) +
      (BAR_THICKNESS_PX / 2) * Math.abs(Math.cos(rad));
    minX = Math.min(minX, placement.x - halfX);
    maxX = Math.max(maxX, placement.x + halfX);
    minY = Math.min(minY, placement.y - halfY);
    maxY = Math.max(maxY, placement.y + halfY);
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  };
}
