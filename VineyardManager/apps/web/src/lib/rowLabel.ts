/**
 * Single source of truth for how a vineyard row is labelled in the UI.
 *
 * Model notes (packages/shared): `Row.variety` is a single free-text string
 * (no primary flag, no row→variety join table). Embedded row refs on tasks,
 * harvests, activities, and health rows carry only `{ id, code, name }`, so
 * callers pass a lookup built from the vineyard's rows to resolve variety.
 * If the string lists several varieties ("Merlot, Cabernet Franc") the first
 * is used plus " +N".
 */

export type RowLabelSource = {
  id?: string;
  rowId?: string;
  code: string;
  name?: string | null;
  variety?: string | null;
  /** Set by the API when the row was removed (soft-deleted). */
  deletedAt?: string | null;
};

export const REMOVED_ROW_LABEL = "Removed row";

const OLD_CODE_PATTERN = /__old_[0-9a-f]+$/i;

/**
 * True when the row was removed: API flag (deletedAt) first, then the
 * "<code>__old_<id8>" rename used by row delete and seed vacateCode.
 * Removed rows get no map link.
 */
export function isRemovedRow(row: RowLabelSource | null | undefined): boolean {
  if (!row) return false;
  return Boolean(row.deletedAt) || OLD_CODE_PATTERN.test(row.code);
}

/** Original code without the "__old_<id8>" suffix. */
export function originalRowCode(row: RowLabelSource): string {
  return row.code.replace(OLD_CODE_PATTERN, "");
}

/** Row id → variety string. */
export type RowVarietyLookup = ReadonlyMap<string, string>;

export function buildVarietyLookup(
  rows: ReadonlyArray<{ id: string; variety?: string | null }>,
): RowVarietyLookup {
  const lookup = new Map<string, string>();
  for (const row of rows) {
    if (row.variety?.trim()) lookup.set(row.id, row.variety);
  }
  return lookup;
}

function splitVarieties(value: string): string[] {
  return value
    .split(/\s*[,;/&]\s*|\s+\+\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Short variety text for a row ("Merlot", "Merlot +1"), or null if unknown. */
export function rowVarietyText(
  row: RowLabelSource,
  lookup?: RowVarietyLookup,
): string | null {
  const id = row.id ?? row.rowId;
  const raw = row.variety?.trim() || (id ? lookup?.get(id) : undefined) || "";
  const parts = splitVarieties(raw);
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0]! : `${parts[0]} +${parts.length - 1}`;
}

/** Short label: "NS3 Merlot"; falls back to "NS3 North South 3", then "NS3". */
export function rowLabel(row: RowLabelSource, lookup?: RowVarietyLookup): string {
  if (isRemovedRow(row)) return REMOVED_ROW_LABEL;
  const variety = rowVarietyText(row, lookup);
  if (variety) return `${row.code} ${variety}`;
  const name = row.name?.trim();
  return name ? `${row.code} ${name}` : row.code;
}

/** Secondary info shown alongside the short label (the row name), or null. */
export function rowSecondaryLabel(
  row: RowLabelSource,
  lookup?: RowVarietyLookup,
): string | null {
  if (isRemovedRow(row)) return null;
  const name = row.name?.trim();
  if (!name) return null;
  // When there's no variety the name is already in the short label.
  return rowVarietyText(row, lookup) ? name : null;
}

/** Full label: "NS3 Merlot · North South 3" (or the short label if no extra info). */
export function rowFullLabel(row: RowLabelSource, lookup?: RowVarietyLookup): string {
  if (isRemovedRow(row)) return `${REMOVED_ROW_LABEL} (was ${originalRowCode(row)})`;
  const short = rowLabel(row, lookup);
  const secondary = rowSecondaryLabel(row, lookup);
  return secondary ? `${short} · ${secondary}` : short;
}
