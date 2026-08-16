import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type ScheduledTask,
  type TaskStatus,
} from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useVineyardTasks } from "@/hooks/useVineyardTasks";
import { ApiError, updateTask } from "@/lib/api";

export function TasksPage() {
  const { state, reload } = useVineyardTasks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [rowFilter, setRowFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (task: ScheduledTask) => {
    setEditing(task);
    setDialogOpen(true);
  };

  const vineyardReady = state.status === "ready";

  const visibleTasks = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.tasks.filter((task) => {
      if (rowFilter === "__none__" && task.rowId) return false;
      if (rowFilter && rowFilter !== "__none__" && task.rowId !== rowFilter) {
        return false;
      }
      if (statusFilter && task.status !== statusFilter) return false;
      return true;
    });
  }, [state, rowFilter, statusFilter]);

  const handleStatusChange = async (
    task: ScheduledTask,
    status: TaskStatus,
  ) => {
    if (state.status !== "ready") return;
    setActionError(null);
    try {
      await updateTask(state.vineyard.id, task.id, { status });
      await reload({ silent: true });
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : "Could not update the task status.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Tasks"
        description={
          vineyardReady
            ? `${state.vineyard.name} — scheduled work, linked to a row or the whole vineyard.`
            : "Upcoming work and notifications. Link each task to a row when it applies to one place."
        }
        actions={
          vineyardReady ? (
            <Button type="button" onClick={openCreate}>
              New task
            </Button>
          ) : null
        }
      />

      {state.status === "loading" ? (
        <div className="space-y-3" aria-busy="true">
          <Card className="min-h-28 animate-pulse bg-card/70" />
          <Card className="min-h-28 animate-pulse bg-card/70" />
          <p className="sr-only">Loading tasks</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <EmptyState
          title="Could not load tasks"
          action={
            <Button type="button" onClick={() => void reload()}>
              Try again
            </Button>
          }
        >
          {state.message} Confirm the API is running on http://localhost:3001.
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
          Create a vineyard and rows first, then add tasks.
        </EmptyState>
      ) : null}

      {vineyardReady ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Row</span>
              <select
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                value={rowFilter}
                onChange={(event) => setRowFilter(event.target.value)}
              >
                <option value="">All rows</option>
                <option value="__none__">Whole vineyard only</option>
                {state.rows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.code} · {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Status</span>
              <select
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">All statuses</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {TASK_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {actionError ? (
            <p className="mb-4 text-sm text-health-red" role="alert">
              {actionError}
            </p>
          ) : null}

          {state.tasks.length === 0 ? (
            <EmptyState
              title="No tasks yet"
              action={
                <Button type="button" onClick={openCreate}>
                  New task
                </Button>
              }
            >
              Add pruning, watering, harvest, or weather work for a row.
            </EmptyState>
          ) : visibleTasks.length === 0 ? (
            <EmptyState title="No tasks match these filters">
              Clear the row or status filter to see the full list.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {visibleTasks.map((task) => (
                <li key={task.id}>
                  <TaskCard
                    task={task}
                    onEdit={openEdit}
                    onStatusChange={(item, status) =>
                      void handleStatusChange(item, status)
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          <TaskFormDialog
            vineyardId={state.vineyard.id}
            rows={state.rows}
            task={editing}
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            onSaved={() => reload({ silent: true })}
          />
        </>
      ) : null}
    </div>
  );
}
