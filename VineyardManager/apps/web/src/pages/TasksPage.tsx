import { useMemo, useRef, useState } from "react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useVineyardTasks } from "@/hooks/useVineyardTasks";
import { ApiError, deleteTask, updateTask } from "@/lib/api";
import { buildVarietyLookup, rowLabel } from "@/lib/rowLabel";

export function TasksPage() {
  const { canOperate } = useRoleAccess();
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

  const [deleting, setDeleting] = useState<ScheduledTask | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Set on a successful delete so focus lands on the h1, not the removed card.
  const deleteFocusRef = useRef<HTMLElement | null>(null);

  const openDelete = (task: ScheduledTask) => {
    setActionError(null);
    setDeleteError(null);
    deleteFocusRef.current = null;
    setDeleting(task);
  };

  const confirmDelete = async () => {
    if (state.status !== "ready" || !deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteTask(state.vineyard.id, deleting.id);
      setDeleteBusy(false);
      deleteFocusRef.current = headingRef.current;
      setDeleting(null);
      await reload({ silent: true });
    } catch (error) {
      setDeleteBusy(false);
      setDeleteError(
        error instanceof ApiError ? error.message : "Could not delete the task.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        headingRef={headingRef}
        title="Tasks"
        description={
          vineyardReady
            ? `${state.vineyard.name} — scheduled work, linked to a row or the whole vineyard.`
            : "Upcoming work and notifications. Link each task to a row when it applies to one place."
        }
        actions={
          vineyardReady && canOperate ? (
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
                    {rowLabel(row)}
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
                canOperate ? (
                  <Button type="button" onClick={openCreate}>
                    New task
                  </Button>
                ) : undefined
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
                    varietyLookup={buildVarietyLookup(state.rows)}
                    task={task}
                    onEdit={canOperate ? openEdit : undefined}
                    onStatusChange={
                      canOperate
                        ? (item, status) => void handleStatusChange(item, status)
                        : undefined
                    }
                    onDelete={
                      canOperate ? openDelete : undefined
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

          <ConfirmDialog
            open={deleting !== null}
            onClose={() => {
              if (!deleteBusy) setDeleting(null);
            }}
            title="Delete task?"
            returnFocusRef={deleteFocusRef}
            busy={deleteBusy}
            error={deleteError}
            description={
              deleting ? (
                <>
                  <span className="block min-w-0 font-medium [overflow-wrap:anywhere] text-foreground">
                    {deleting.title}
                  </span>
                  <span className="block min-w-0 [overflow-wrap:anywhere]">
                    Due{" "}
                    {new Date(deleting.dueAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    {deleting.row
                      ? ` · ${rowLabel(deleting.row, buildVarietyLookup(state.rows))}`
                      : ""}
                  </span>
                  <span className="mt-2 block">
                    This removes the task from the task list.
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
                {deleteBusy ? "Deleting…" : "Delete task"}
              </Button>
            }
          />
        </>
      ) : null}
    </div>
  );
}
