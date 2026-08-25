import { ACTIVITY_TYPE_LABELS, type Activity } from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";

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

export function ActivityCard({ activity }: { activity: Activity }) {
  const scopeLabel =
    activity.scopeType === "row" && activity.row
      ? `${activity.row.code} · ${activity.row.name}`
      : "Whole vineyard";
  const notes = notesExcerpt(activity.details);

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">{scopeLabel}</p>
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
          <Badge variant="muted">{formatDate(activity.performedAt)}</Badge>
          {activity.activityType === "harvest" ? (
            <Badge variant="yellow">Note only</Badge>
          ) : null}
        </div>
      </div>
    </article>
  );
}
