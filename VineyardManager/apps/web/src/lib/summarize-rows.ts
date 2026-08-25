import type { Row } from "@vineyard/shared";

export function summarizeRows(rows: Row[]) {
  const active = rows.filter((row) => row.status === "active");
  const totalInches = rows.reduce(
    (sum, row) => sum + row.lengthFeet * 12 + row.lengthInches,
    0,
  );
  const lengthFeet = Math.floor(totalInches / 12);
  const lengthInches = totalInches % 12;
  const vines = rows.reduce((sum, row) => sum + row.vineCount, 0);
  return {
    total: rows.length,
    active: active.length,
    lengthFeet,
    lengthInches,
    vines,
  };
}
