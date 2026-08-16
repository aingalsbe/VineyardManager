import {
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  type ScheduledTask,
  type TaskStatus,
} from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const statusVariant: Record<
  TaskStatus,
  "green" | "yellow" | "orange" | "muted"
> = {
  pending: "yellow",
  sent: "orange",
  acknowledged: "green",
  dismissed: "muted",
};

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TaskCard({
  task,
  onEdit,
  onStatusChange,
}: {
  task: ScheduledTask;
  onEdit: (task: ScheduledTask) => void;
  onStatusChange: (task: ScheduledTask, status: TaskStatus) => void;
}) {
  const rowLabel = task.row
    ? `${task.row.code} · ${task.row.name}`
    : "Whole vineyard";

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{rowLabel}</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            {task.title}
          </h2>
          {task.body ? (
            <p className="mt-1 text-muted">{task.body}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant="muted">{TASK_TYPE_LABELS[task.type]}</Badge>
          <Badge variant={statusVariant[task.status]}>
            {TASK_STATUS_LABELS[task.status]}
          </Badge>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <span className="text-muted">Due </span>
          <span className="font-medium">{formatDue(task.dueAt)}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {task.status !== "acknowledged" ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onStatusChange(task, "acknowledged")}
            >
              Mark complete
            </Button>
          ) : null}
          {task.status === "pending" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onStatusChange(task, "sent")}
            >
              Start
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onEdit(task)}
          >
            Edit
          </Button>
        </div>
      </div>
    </article>
  );
}
