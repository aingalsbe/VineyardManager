import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/format";
import {
  RECENTLY_REMOVED_SUBTITLE,
  RESTORE_HINT,
  removedToggleLabel,
} from "@/lib/seasonCopy";

/**
 * Shared list chrome for Tasks / Harvests / Work log / Rows (Sage review):
 * Recently removed toggle, subtitle, card-style notices with Undo, the
 * "Removed {date}" + Restore footer, the closed-season read-only notice, and
 * the single delete-dialog body pattern.
 */

export function RecentlyRemovedToggle({
  showingRemoved,
  listName,
  onToggle,
}: {
  showingRemoved: boolean;
  listName: "tasks" | "harvests" | "work log" | "rows";
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      aria-pressed={showingRemoved}
      onClick={onToggle}
    >
      {removedToggleLabel(showingRemoved, listName)}
    </Button>
  );
}

export function RecentlyRemovedSubtitle() {
  return (
    <p className="mb-4 text-base font-medium text-foreground">
      {RECENTLY_REMOVED_SUBTITLE}
    </p>
  );
}

export type ListNotice = {
  tone: "ok" | "error";
  text: string;
  /** When set, the notice shows an Undo button that calls it. */
  undo?: () => Promise<void>;
};

/** Bordered card notice (P3) with optional Undo; errors use role=alert. */
export function ActionNotice({
  notice,
  onDismiss,
}: {
  notice: ListNotice | null;
  onDismiss: () => void;
}) {
  const [undoing, setUndoing] = useState(false);
  if (!notice) return null;
  const isError = notice.tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={
        isError
          ? "mb-4 flex flex-col gap-3 rounded-lg border border-red-700/30 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
          : "mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between"
      }
    >
      <p className="min-w-0 [overflow-wrap:anywhere]">{notice.text}</p>
      <div className="flex shrink-0 gap-2">
        {notice.undo ? (
          <Button
            type="button"
            variant="outline"
            size="smTouch"
            disabled={undoing}
            onClick={() => {
              const undo = notice.undo;
              if (!undo) return;
              setUndoing(true);
              void undo().finally(() => setUndoing(false));
            }}
          >
            {undoing ? "Undoing…" : "Undo"}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="smTouch" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

/**
 * Same footer on every Recently removed card (P2 #5): "Removed {date}" and
 * one h-11 outline "Restore" button in the same spot.
 */
export function RemovedFooter({
  deletedAt,
  onRestore,
  lockedReason,
}: {
  deletedAt: string | null | undefined;
  onRestore?: () => void;
  /** Shown instead of Restore when the record can't be restored (closed season). */
  lockedReason?: string;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted">
        Removed {formatShortDate(deletedAt) || "recently"}
      </p>
      {lockedReason ? (
        <p className="text-sm text-muted">{lockedReason}</p>
      ) : onRestore ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto"
          onClick={onRestore}
        >
          Restore
        </Button>
      ) : null}
    </div>
  );
}

/** Closed-season read-only notice above a filtered list (P3). */
export function ClosedSeasonNotice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div
      role="note"
      className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground"
    >
      <Lock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <p className="min-w-0">{text}</p>
    </div>
  );
}

/**
 * Delete-dialog body (Sage's single pattern): the item named in bold, an
 * optional detail line, optional extra content, then the restore hint.
 */
export function DeleteItemDescription({
  name,
  detail,
  extra,
}: {
  name: ReactNode;
  detail?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <>
      <span className="block min-w-0 font-semibold [overflow-wrap:anywhere] text-foreground">
        {name}
      </span>
      {detail ? (
        <span className="block min-w-0 [overflow-wrap:anywhere]">{detail}</span>
      ) : null}
      {extra}
      <span className="mt-2 block">{RESTORE_HINT}</span>
    </>
  );
}
