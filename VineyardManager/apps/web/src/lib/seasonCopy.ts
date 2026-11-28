/**
 * Pure copy/decision helpers for the Seasons UI (Sage review fixes). Kept free
 * of React and path aliases so node:test can import them directly.
 */
import { formatShortDate } from "./format.ts";

export type SeasonLike = {
  id: string;
  year: number;
  status: "legacy" | "active" | "planned" | "closed";
  startedAt: string | null;
  closedAt?: string | null;
  reopenableUntil?: string | null;
};

/** One label for every "start the next season" control (P3 copy). */
export function startSeasonLabel(year: number | null | undefined): string {
  return year ? `Start ${year} season` : "Start season";
}

/**
 * Start line on Past Seasons / season detail (P2 #8): "Not started yet" only
 * for planned seasons; "Started Mar 1, 2026" when known; otherwise
 * "Start date not recorded".
 */
export function seasonStartLine(season: Pick<SeasonLike, "status" | "startedAt">): string {
  if (season.status === "planned") return "Not started yet";
  const started = formatShortDate(season.startedAt);
  return started ? `Started ${started}` : "Start date not recorded";
}

/** "Closed Nov 28, 2026" (P3: no "Closed · Closed …"). */
export function seasonClosedLine(closedAt: string | null | undefined): string {
  const closed = formatShortDate(closedAt);
  return closed ? `Closed ${closed}` : "Closed";
}

/**
 * Mirror of the API's `?seasonId=` resolution (G3): "all"/"" -> null,
 * "current" -> active, else planned, else latest closed; otherwise that id.
 */
export function resolveSeasonFilter<T extends SeasonLike>(
  seasons: readonly T[],
  filter: string,
): T | null {
  if (!filter || filter === "all") return null;
  if (filter === "current") {
    const byYearDesc = [...seasons].sort((a, b) => b.year - a.year);
    return (
      byYearDesc.find((s) => s.status === "active") ??
      byYearDesc.find((s) => s.status === "planned") ??
      byYearDesc.find((s) => s.status === "closed") ??
      null
    );
  }
  return seasons.find((s) => s.id === filter) ?? null;
}

export type ListNoun = "tasks" | "harvests" | "work log entries" | "rows";

/**
 * Empty-state copy for a season-filtered list (P2 #7). When the list is
 * filtered to one season, say which season and offer "Show all seasons".
 */
export function seasonEmptyState(
  noun: ListNoun,
  filter: string,
  season: Pick<SeasonLike, "year"> | null,
): { title: string; showAllSeasons: boolean } {
  const filtered = Boolean(filter) && filter !== "all";
  if (filtered && season) {
    return {
      title: `No ${noun} in the ${season.year} season yet`,
      showAllSeasons: true,
    };
  }
  if (filtered) {
    return { title: `No ${noun} in this season yet`, showAllSeasons: true };
  }
  return { title: `No ${noun} yet`, showAllSeasons: false };
}

/**
 * Read-only notice for a closed season's list (P3). Mentions the reopen
 * window only while it is still open.
 */
export function closedSeasonNotice(
  season: Pick<SeasonLike, "year" | "status" | "reopenableUntil">,
  now: Date = new Date(),
): string | null {
  if (season.status !== "closed") return null;
  const base = `${season.year} is closed, so these records are read-only.`;
  const until = season.reopenableUntil ? new Date(season.reopenableUntil) : null;
  if (until && !Number.isNaN(until.getTime()) && until.getTime() > now.getTime()) {
    return `${base} A power user can reopen it in Setup until ${formatShortDate(until)}.`;
  }
  return base;
}

export type DeleteKind = "task" | "harvest" | "work entry" | "row";

/** Single delete-dialog copy pattern (Sage): "Delete task?" etc. */
export function deleteDialogTitle(kind: DeleteKind): string {
  return `Delete ${kind}?`;
}

/** No expiry wording: D-02 keeps removed items with no time limit. */
export const RESTORE_HINT = "You can restore it from Recently removed.";

/** Toggle label (P2 #6): "Recently removed" off; "Back to {list}" on. */
export function removedToggleLabel(
  showingRemoved: boolean,
  listName: "tasks" | "harvests" | "work log" | "rows",
): string {
  return showingRemoved ? `Back to ${listName}` : "Recently removed";
}

export const RECENTLY_REMOVED_SUBTITLE = "Recently removed. Restore any item.";

/** Notice after a delete/restore (P3 card notice with Undo). */
export function deletedNotice(kind: DeleteKind): string {
  const noun = kind.charAt(0).toUpperCase() + kind.slice(1);
  return `${noun} deleted. ${RESTORE_HINT}`;
}
