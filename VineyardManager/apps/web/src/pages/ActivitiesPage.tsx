import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPES,
  type Activity,
  type ActivityType,
} from "@vineyard/shared";
import { ActivityCard } from "@/components/activities/ActivityCard";
import { ActivityFormDialog } from "@/components/activities/ActivityFormDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useActivities } from "@/hooks/useActivities";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useVineyardSeasons } from "@/hooks/useVineyardSeasons";
import { ApiError, deleteActivity, restoreActivity } from "@/lib/api";
import { buildVarietyLookup, rowLabel } from "@/lib/rowLabel";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ActivitiesPage() {
  const { canOperate, canSetup } = useRoleAccess();
  const seasons = useVineyardSeasons();
  const [seasonFilter, setSeasonFilter] = useState("current");
  const [showRemoved, setShowRemoved] = useState(false);
  const { state, reload } = useActivities({
    deleted: showRemoved ? "only" : undefined,
    seasonId: showRemoved ? undefined : seasonFilter,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [presetType, setPresetType] = useState<ActivityType | undefined>();
  const [rowFilter, setRowFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const deleteFocusRef = useRef<HTMLElement | null>(null);

  const openCreate = (type?: ActivityType) => {
    setEditing(null);
    setPresetType(type);
    setDialogOpen(true);
  };

  const openEdit = (activity: Activity) => {
    setEditing(activity);
    setPresetType(undefined);
    setDialogOpen(true);
  };

  const openDelete = (activity: Activity) => {
    setNotice(null);
    setDeleteError(null);
    deleteFocusRef.current = null;
    setDeleting(activity);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteActivity(deleting.id);
      setDeleteBusy(false);
      deleteFocusRef.current = headingRef.current;
      setDeleting(null);
      setNotice({
        tone: "ok",
        text: "Work entry removed. You can restore it from Recently removed.",
      });
      await reload({ silent: true });
    } catch (error) {
      setDeleteBusy(false);
      setDeleteError(
        error instanceof ApiError ? error.message : "Could not delete the work entry.",
      );
    }
  };

  const handleRestore = async (activity: Activity) => {
    setNotice(null);
    try {
      await restoreActivity(activity.id);
      setNotice({ tone: "ok", text: "Work entry restored." });
      await reload({ silent: true });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof ApiError
            ? error.message
            : "Could not restore the work entry.",
      });
    }
  };

  const ready = state.status === "ready";

  const visible = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.activities.filter((activity) => {
      if (rowFilter && activity.rowId !== rowFilter) return false;
      if (typeFilter && activity.activityType !== typeFilter) return false;
      return true;
    });
  }, [state, rowFilter, typeFilter]);

  const varietyLookup = useMemo(
    () => (state.status === "ready" ? buildVarietyLookup(state.rows) : undefined),
    [state],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        headingRef={headingRef}
        title="Log work"
        description="Record pruning, watering, and other work on the whole vineyard or a row."
        actions={
          ready && canOperate ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={showRemoved ? "default" : "outline"}
                onClick={() => {
                  setNotice(null);
                  setShowRemoved((v) => !v);
                }}
              >
                {showRemoved ? "Viewing recently removed" : "Recently removed"}
              </Button>
              {!showRemoved ? (
                <Button type="button" onClick={() => openCreate()}>
                  Log work
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />

      {state.status === "loading" ? (
        <div className="space-y-3" aria-busy="true">
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <p className="sr-only">Loading work log</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <EmptyState
          title="Could not load work"
          action={
            <Button type="button" onClick={() => void reload()}>
              Try again
            </Button>
          }
        >
          {state.message}
        </EmptyState>
      ) : null}

      {state.status === "empty-vineyard" ? (
        <EmptyState
          title="No vineyard yet"
          action={
            canSetup ? (
              <Button asChild variant="outline">
                <Link to="/setup">Go to setup</Link>
              </Button>
            ) : undefined
          }
        >
          {canSetup
            ? "Add the vineyard and rows first, then log work."
            : "Ask a power user to set up the vineyard."}
        </EmptyState>
      ) : null}

      {ready ? (
        <>
          {canOperate && !showRemoved ? (
            <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ACTIVITY_TYPES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant="outline"
                  onClick={() => openCreate(type)}
                >
                  {ACTIVITY_TYPE_LABELS[type]}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {!showRemoved ? (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Season</span>
                <select
                  className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                  value={seasonFilter}
                  onChange={(event) => setSeasonFilter(event.target.value)}
                >
                  <option value="current">Current season</option>
                  <option value="all">All seasons</option>
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.year} ({season.status})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Row</span>
              <select
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                value={rowFilter}
                onChange={(event) => setRowFilter(event.target.value)}
              >
                <option value="">All rows</option>
                {state.rows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {rowLabel(row)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Type</span>
              <select
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="">All types</option>
                {ACTIVITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ACTIVITY_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {notice ? (
            <p
              className={
                notice.tone === "error"
                  ? "mb-4 text-sm text-health-red"
                  : "mb-4 text-sm text-muted"
              }
              role={notice.tone === "error" ? "alert" : "status"}
            >
              {notice.text}
            </p>
          ) : null}

          {state.activities.length === 0 ? (
            <EmptyState
              title={showRemoved ? "No recently removed work" : "No work logged yet"}
              action={
                !showRemoved && canOperate ? (
                  <Button type="button" onClick={() => openCreate()}>
                    Log work
                  </Button>
                ) : undefined
              }
            >
              {showRemoved
                ? "Deleted work log entries appear here and can be restored."
                : "Record pruning, watering, or an observation to start the log."}
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState title="No work matches these filters">
              Clear the row or type filter to see the full log.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {visible.map((activity) => (
                <li key={activity.id}>
                  <ActivityCard
                    varietyLookup={varietyLookup}
                    activity={activity}
                    onEdit={canOperate && !showRemoved ? openEdit : undefined}
                    onDelete={canOperate && !showRemoved ? openDelete : undefined}
                    onRestore={
                      canOperate && showRemoved
                        ? (item) => void handleRestore(item)
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          <ActivityFormDialog
            vineyardId={state.vineyardId}
            rows={state.rows}
            activity={editing}
            presetType={presetType}
            open={dialogOpen}
            onClose={() => {
              setDialogOpen(false);
              setEditing(null);
            }}
            onSaved={() => reload({ silent: true })}
          />

          <ConfirmDialog
            open={deleting !== null}
            onClose={() => {
              if (!deleteBusy) setDeleting(null);
            }}
            title="Delete work entry?"
            returnFocusRef={deleteFocusRef}
            busy={deleteBusy}
            error={deleteError}
            description={
              deleting ? (
                <>
                  <span className="block min-w-0 font-medium [overflow-wrap:anywhere] text-foreground">
                    {ACTIVITY_TYPE_LABELS[deleting.activityType]}
                  </span>
                  <span className="block min-w-0 [overflow-wrap:anywhere]">
                    {formatShortDate(deleting.performedAt)}
                    {deleting.scopeType === "row" && deleting.row
                      ? ` · ${rowLabel(deleting.row, varietyLookup)}`
                      : " · Whole vineyard"}
                  </span>
                  <span className="mt-2 block">
                    This removes the entry from the work log. It can be restored from
                    Recently removed.
                  </span>
                </>
              ) : null
            }
            actions={
              <Button
                type="button"
                variant="destructive"
                className="w-full sm:w-auto"
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? "Deleting…" : "Delete entry"}
              </Button>
            }
          />
        </>
      ) : null}
    </div>
  );
}
