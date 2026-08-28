import { Link } from "react-router-dom";
import {
  type ActivityType,
  type Row,
  type RowHealth,
  type ScheduledTask,
} from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { healthSwatch } from "@/lib/health";
import { useEffect, useId, useMemo, useState } from "react";

function isOpenTask(task: ScheduledTask): boolean {
  return task.status !== "acknowledged" && task.status !== "dismissed";
}

function titleFromTaskReason(message: string): string | null {
  const overdue = /^Overdue:\s*(.+)$/.exec(message);
  if (overdue?.[1]) return overdue[1];
  const soon = /^Due soon:\s*(.+)$/.exec(message);
  return soon?.[1] ?? null;
}

export function RowActionPanel({
  row,
  health,
  tasks,
  busy = false,
  suspendEscape = false,
  error,
  onClose,
  onCompleteTask,
  onLogWork,
}: {
  row: Row;
  health: RowHealth | null;
  tasks: ScheduledTask[];
  busy?: boolean;
  suspendEscape?: boolean;
  error?: string | null;
  onClose: () => void;
  onCompleteTask: (taskId: string) => void;
  onLogWork: (type?: ActivityType) => void;
}) {
  const titleId = useId();
  const [pickedTaskId, setPickedTaskId] = useState("");

  const openRowTasks = useMemo(
    () => tasks.filter((task) => task.rowId === row.id && isOpenTask(task)),
    [tasks, row.id],
  );

  const reasons = health?.reasons ?? [];
  const hasWateringReason = reasons.some(
    (reason) =>
      reason.code === "no_watering" ||
      reason.message.toLowerCase().includes("watering"),
  );
  const hasPestReason = reasons.some(
    (reason) =>
      reason.code === "no_pest_weed" ||
      reason.message.toLowerCase().includes("pest"),
  );
  const hasWeedReason = reasons.some(
    (reason) =>
      reason.code === "no_pest_weed" ||
      reason.message.toLowerCase().includes("weed"),
  );

  const matchedTasks = reasons.flatMap((reason) => {
    const title = titleFromTaskReason(reason.message);
    if (!title) return [];
    const task = openRowTasks.find((item) => item.title === title);
    return task ? [{ reason, task }] : [];
  });
  const unmatchedTaskReasons = reasons.filter((reason) => {
    const title = titleFromTaskReason(reason.message);
    if (!title) return false;
    return !openRowTasks.some((item) => item.title === title);
  });

  const noHealthActions =
    !hasWateringReason &&
    !hasPestReason &&
    !hasWeedReason &&
    matchedTasks.length === 0 &&
    unmatchedTaskReasons.length === 0;

  useEffect(() => {
    if (suspendEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, suspendEscape]);

  useEffect(() => {
    if (
      unmatchedTaskReasons.length > 0 &&
      openRowTasks[0] &&
      !pickedTaskId
    ) {
      setPickedTaskId(openRowTasks[0].id);
    }
  }, [unmatchedTaskReasons.length, openRowTasks, pickedTaskId]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-foreground/40 px-4 py-8"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary">{row.code}</p>
            <h2 id={titleId} className="text-2xl font-semibold tracking-tight">
              {row.name}
            </h2>
          </div>
          {health ? (
            <Badge variant={health.color}>
              {health.color} {health.score}
            </Badge>
          ) : null}
        </div>

        {health ? (
          <div className="mt-3 flex items-center gap-2 text-muted">
            <span
              className={`size-3 rounded-full ${healthSwatch[health.color]}`}
              aria-hidden
            />
            <span className="capitalize">
              {health.color} · {health.score}
            </span>
          </div>
        ) : null}

        {reasons.length > 0 ? (
          <ul className="mt-4 space-y-1 text-muted">
            {reasons.map((reason) => (
              <li key={`${reason.code}-${reason.message}`}>{reason.message}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-muted">
            No action needed from health rules.
          </p>
        )}

        {noHealthActions && reasons.length > 0 ? (
          <p className="mt-2 text-sm text-muted">
            No action needed from health rules beyond logging other work.
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm font-medium text-health-red" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          {matchedTasks.map(({ task }) => (
            <Button
              key={task.id}
              type="button"
              disabled={busy}
              onClick={() => onCompleteTask(task.id)}
            >
              Complete task: {task.title}
            </Button>
          ))}

          {unmatchedTaskReasons.length > 0 && openRowTasks.length > 0 ? (
            <div className="rounded-md border border-border p-3">
              <p className="text-sm text-muted">
                Could not match that overdue title. Pick an open task for this
                row.
              </p>
              <select
                className="mt-2 h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                value={pickedTaskId}
                onChange={(event) => setPickedTaskId(event.target.value)}
                disabled={busy}
              >
                {openRowTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                className="mt-2 w-full"
                disabled={busy || !pickedTaskId}
                onClick={() => onCompleteTask(pickedTaskId)}
              >
                Complete selected task
              </Button>
            </div>
          ) : null}

          {hasWateringReason ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onLogWork("watering")}
            >
              Log watering
            </Button>
          ) : null}
          {hasPestReason ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onLogWork("pest_prevention")}
            >
              Log pest prevention
            </Button>
          ) : null}
          {hasWeedReason ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onLogWork("weed_prevention")}
            >
              Log weed prevention
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onLogWork()}
          >
            Log other work
          </Button>
          <Button asChild variant="link" className="justify-start px-0">
            <Link to={`/rows?row=${encodeURIComponent(row.code)}`}>Open row</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
