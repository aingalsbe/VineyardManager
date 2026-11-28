/**
 * Shared display formatters for the Seasons surfaces (Sage P2 #9). Self-contained
 * (no path aliases) so node:test can import it directly.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Mar 8, 2026". Accepts a full ISO timestamp, a Date, or a calendar date
 * ("2026-03-08"); calendar dates are read at local noon so they never shift a
 * day across time zones. Returns "" for empty or invalid input.
 */
export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-").map(Number) as [number, number, number];
    date = new Date(y, m - 1, d, 12, 0, 0);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "Jan" from "2026-01" / "2026-01-15" / ISO; "" when invalid. */
export function formatShortMonth(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 15, 12);
  return date.toLocaleDateString("en-US", { month: "short" });
}

/** Thousands separators: 4506 -> "4,506"; keeps up to 1 decimal. */
export function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** 4506 -> "4,506 lb". */
export function formatPounds(value: number): string {
  return `${formatNumber(value)} lb`;
}
