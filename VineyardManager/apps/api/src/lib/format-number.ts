const US_NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** 5490 -> "5,490"; 15.5 -> "15.5". Used for every pound figure in summary text and email. */
export function formatNumber(value: number): string {
  return US_NUMBER.format(value);
}

/** 5490 -> "5,490 lb". */
export function formatLb(value: number | null): string {
  return `${formatNumber(value ?? 0)} lb`;
}
