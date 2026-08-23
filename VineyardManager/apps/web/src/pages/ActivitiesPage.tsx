import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPES,
  type ActivityType,
} from "@vineyard/shared";
import { ActivityCard } from "@/components/activities/ActivityCard";
import { ActivityFormDialog } from "@/components/activities/ActivityFormDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useActivities } from "@/hooks/useActivities";

export function ActivitiesPage() {
  const { state, reload } = useActivities();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [presetType, setPresetType] = useState<ActivityType | undefined>();
  const [rowFilter, setRowFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const openCreate = (type?: ActivityType) => {
    setPresetType(type);
    setDialogOpen(true);
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

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Log work"
        description="Record pruning, watering, and other work on the whole vineyard or a row."
        actions={
          ready ? (
            <Button type="button" onClick={() => openCreate()}>
              Log work
            </Button>
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
            <Button asChild variant="outline">
              <Link to="/setup">Go to setup</Link>
            </Button>
          }
        >
          Add the vineyard and rows first, then log work.
        </EmptyState>
      ) : null}

      {ready ? (
        <>
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

          <div className="mb-5 grid gap-3 sm:grid-cols-2">
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
                    {row.code} · {row.name}
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

          {state.activities.length === 0 ? (
            <EmptyState
              title="No work logged yet"
              action={
                <Button type="button" onClick={() => openCreate()}>
                  Log work
                </Button>
              }
            >
              Record pruning, watering, or an observation to start the log.
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState title="No work matches these filters">
              Clear the row or type filter to see the full log.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {visible.map((activity) => (
                <li key={activity.id}>
                  <ActivityCard activity={activity} />
                </li>
              ))}
            </ul>
          )}

          <ActivityFormDialog
            vineyardId={state.vineyardId}
            rows={state.rows}
            presetType={presetType}
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            onSaved={() => reload({ silent: true })}
          />
        </>
      ) : null}
    </div>
  );
}
