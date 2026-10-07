import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Row } from "@vineyard/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ApiError,
  deleteRow,
  deleteRowPreview,
  type DeleteRowResult,
  type RowDeleteOpenTasksOption,
  type RowDeletePreview,
  type RowDeletePreviewOpenTask,
} from "@/lib/api";
import { pluralize } from "@/lib/pluralize";
import { rowFullLabel, rowLabel } from "@/lib/rowLabel";

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; preview: RowDeletePreview };

/** Parse "YYYY-MM-DD" as a local calendar date (no UTC day shift). */
function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function OpenTaskItem({ task }: { task: RowDeletePreviewOpenTask }) {
  const due = task.dueDate ? parseLocalDate(task.dueDate) : null;
  const overdue = due ? due < startOfToday() : false;
  return (
    <li className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
      <span className="min-w-0 font-medium [overflow-wrap:anywhere] text-foreground">
        {task.title}
      </span>
      <span className="shrink-0 text-sm text-muted">
        {due ? `Due ${formatDate(due)}` : "No due date"}
        {overdue ? (
          <span className="font-semibold text-foreground"> · Overdue</span>
        ) : null}
      </span>
    </li>
  );
}

function historySummary(counts: RowDeletePreview["counts"]): string | null {
  const parts = [
    counts.tasks > 0 ? pluralize(counts.tasks, "task") : null,
    counts.harvests > 0 ? pluralize(counts.harvests, "harvest") : null,
    counts.activities > 0
      ? pluralize(counts.activities, "work log", "work logs")
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Row delete confirmation driven by the API's delete-preview:
 * soft/hard copy comes from `preview.mode` only, open tasks offer
 * dismiss vs keep (?openTasks=dismiss|keep).
 */
export function RowDeleteDialog({
  vineyardId,
  row,
  onClose,
  onDeleted,
  successFocusRef,
}: {
  vineyardId: string;
  /** Row to delete; null = closed. */
  row: Row | null;
  onClose: () => void;
  onDeleted: (result: DeleteRowResult) => void | Promise<void>;
  /** Focus target after a successful delete (the row's card is going away). */
  successFocusRef?: RefObject<HTMLElement | null>;
}) {
  // Empty until a delete succeeds; then ConfirmDialog focuses it on close
  // instead of the (soon removed) opener. Cancel/Escape keep the opener.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [pending, setPending] = useState<RowDeleteOpenTasksOption | "plain" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const rowId = row?.id ?? null;

  const loadPreview = useCallback(async () => {
    if (!rowId) return;
    setState({ status: "loading" });
    try {
      const preview = await deleteRowPreview(vineyardId, rowId);
      setState({ status: "ready", preview });
    } catch (err) {
      setState({
        status: "error",
        message:
          err instanceof ApiError
            ? err.message
            : "Could not check what deleting this row will do.",
      });
    }
  }, [vineyardId, rowId]);

  useEffect(() => {
    setError(null);
    setPending(null);
    void loadPreview();
  }, [loadPreview]);

  if (!row) return null;

  const short = rowLabel(row);
  const full = rowFullLabel(row);
  const busy = pending !== null;
  const preview = state.status === "ready" ? state.preview : null;
  const openTasks = preview?.openTasks ?? [];
  const hasOpenTasks = openTasks.length > 0;

  const confirm = async (choice: RowDeleteOpenTasksOption | "plain") => {
    setPending(choice);
    setError(null);
    try {
      const result = await deleteRow(
        vineyardId,
        row.id,
        choice === "plain" ? undefined : { openTasks: choice },
      );
      setPending(null);
      returnFocusRef.current =
        successFocusRef?.current ??
        document.querySelector<HTMLElement>("main h1");
      await onDeleted(result);
    } catch (err) {
      setPending(null);
      setError(
        err instanceof ApiError ? err.message : "Could not delete the row.",
      );
    }
  };

  const description = (
    <>
      <p>
        <span className="font-medium [overflow-wrap:anywhere] text-foreground">{full}</span>
      </p>
      {preview ? (
        preview.mode === "soft" ? (
          <p className="mt-1">
            Its history is kept, and past records show this row as
            “Removed row”.
          </p>
        ) : (
          <p className="mt-1">
            Deleting removes this row permanently. This can’t be undone.
          </p>
        )
      ) : null}
    </>
  );

  const summary =
    preview && preview.mode === "soft" ? historySummary(preview.counts) : null;

  const actions = preview ? (
    hasOpenTasks ? (
      <>
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={busy}
          onClick={() => void confirm("keep")}
        >
          {pending === "keep" ? "Deleting…" : "Keep tasks and delete"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="w-full sm:w-auto"
          disabled={busy}
          onClick={() => void confirm("dismiss")}
        >
          {pending === "dismiss" ? "Deleting…" : "Dismiss open tasks and delete"}
        </Button>
      </>
    ) : (
      <Button
        type="button"
        variant="destructive"
        className="w-full sm:w-auto"
        disabled={busy}
        onClick={() => void confirm("plain")}
      >
        {pending === "plain" ? "Deleting…" : "Delete row"}
      </Button>
    )
  ) : null;

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={`Delete ${short}?`}
      description={description}
      busy={busy}
      error={error}
      actions={actions}
      returnFocusRef={returnFocusRef}
    >
      {state.status === "loading" ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-4 w-3/4 animate-pulse rounded bg-background" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-background" />
          <p className="text-sm text-muted" role="status">
            Checking what deleting this row will do…
          </p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm text-foreground">{state.message}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadPreview()}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-4">
          {summary ? (
            <p className="text-sm text-muted">
              Kept as history:{" "}
              <span className="text-foreground">{summary}</span>
            </p>
          ) : null}
          {hasOpenTasks ? (
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {pluralize(openTasks.length, "open task")} on this row
              </h3>
              <ul className="mt-1 max-h-48 min-w-0 divide-y divide-border overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-background px-3">
                {openTasks.map((task) => (
                  <OpenTaskItem key={task.id} task={task} />
                ))}
              </ul>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="font-medium text-foreground">
                    Dismiss open tasks and delete
                  </dt>
                  <dd className="text-muted">
                    {openTasks.length === 1
                      ? "The task is closed as dismissed when the row is deleted."
                      : "The tasks are closed as dismissed when the row is deleted."}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">
                    Keep tasks and delete
                  </dt>
                  <dd className="text-muted">
                    {openTasks.length === 1
                      ? "It stays open (still overdue if late) and shows “Removed row”."
                      : "They stay open (still overdue if late) and show “Removed row”."}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      ) : null}
    </ConfirmDialog>
  );
}
