/**
 * "1 open task" / "3 open tasks". Pass `plural` for irregular words.
 * `pluralize(2, "activity", "activities")` → "2 activities".
 */
export function pluralize(
  count: number,
  singular: string,
  plural: string = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
