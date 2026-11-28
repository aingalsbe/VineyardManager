import { ACTIVITY_TYPE_LABELS, type Activity } from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";
import { RemovedFooter } from "@/components/ListChrome";
import { Button } from "@/components/ui/button";
import {
  rowFullLabel,
  rowLabel,
  type RowVarietyLookup,
} from "@/lib/rowLabel";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function notesExcerpt(details: Activity["details"]): string | null {
  if (!details || typeof details !== "object") return null;
  const notes = (details as { notes?: unknown }).notes;
  if (typeof notes !== "string" || !notes.trim()) return null;
  return notes.length > 140 ? `${notes.slice(0, 137)}…` : notes;
}

export function ActivityCard({
  activity,
  varietyLookup,
  onEdit,
  onDelete,
  onRestore,
}: {
  activity: Activity;
  varietyLookup?: RowVarietyLookup;
  onEdit?: (activity: Activity) => void;
  onDelete?: (activity: Activity) => void;
  onRestore?: (activity: Activity) => void;
}) {
  const scopeLabel =
    activity.scopeType === "row" && activity.row
      ? rowLabel(activity.row, varietyLookup)
      : "Whole vineyard";
  const notes = notesExcerpt(activity.details);
  const isClosedSeason = activity.seasonStatus === "closed";
  const isDeleted = Boolean(activity.deletedAt);

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p
            className="text-sm font-medium text-primary"
            title={
              activity.scopeType === "row" && activity.row
                ? rowFullLabel(activity.row, varietyLookup)
                : undefined
            }
          >
            {scopeLabel}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            {ACTIVITY_TYPE_LABELS[activity.activityType]}
          </h2>
          {notes ? <p className="mt-1 text-muted">{notes}</p> : null}
          {activity.performedByDisplayName ? (
            <p className="mt-1 text-sm text-muted">
              Logged by {activity.performedByDisplayName}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isClosedSeason ? <Badge variant="muted">Closed season</Badge> : null}
          <Badge variant="muted">{formatDate(activity.performedAt)}</Badge>
          {activity.activityType === "harvest" ? (
            <Badge variant="yellow">Note only</Badge>
          ) : null}
          {isDeleted ? null : !isClosedSeason ? (
            <>
              {onEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="smTouch"
                  onClick={() => onEdit(activity)}
                >
                  Edit
                </Button>
              ) : null}
              {onDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  size="smTouch"
                  onClick={() => onDelete(activity)}
                >
                  Delete
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      {isDeleted ? (
        <RemovedFooter
          deletedAt={activity.deletedAt}
          onRestore={onRestore ? () => onRestore(activity) : undefined}
          lockedReason={isClosedSeason ? "Closed season, so it can't be restored." : undefined}
        />
      ) : null}
    </article>
  );
}
