import {
  ACTIVITY_TYPES,
  createTaskSchema,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  TASK_TYPE_LABELS,
  TASK_TYPES,
  type ActivityType,
  type Row,
  type ScheduledTask,
  type TaskStatus,
  type TaskType,
} from "@vineyard/shared";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, createTask, updateTask } from "@/lib/api";

type FormValues = {
  title: string;
  body: string;
  rowId: string;
  type: TaskType;
  status: TaskStatus;
  dueAt: string;
  relatedActivityType: string;
};

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyValues(): FormValues {
  return {
    title: "",
    body: "",
    rowId: "",
    type: "maintenance",
    status: "pending",
    dueAt: todayIsoDate(),
    relatedActivityType: "",
  };
}

function valuesFromTask(task: ScheduledTask): FormValues {
  return {
    title: task.title,
    body: task.body,
    rowId: task.rowId ?? "",
    type: task.type,
    status: task.status,
    dueAt: task.dueAt.slice(0, 10),
    relatedActivityType: task.relatedActivityType ?? "",
  };
}

const activityLabels: Record<ActivityType, string> = {
  pruning: "Pruning",
  watering: "Watering",
  fertilization: "Fertilization",
  pest_prevention: "Pest prevention",
  weed_prevention: "Weed prevention",
  harvest: "Harvest",
  health_observation: "Health observation",
  vine_replacement: "Vine replacement",
  winterization: "Winterization",
  other: "Other",
};

export function TaskFormDialog({
  vineyardId,
  rows,
  task,
  open,
  onClose,
  onSaved,
}: {
  vineyardId: string;
  rows: Row[];
  task: ScheduledTask | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const titleId = useId();
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(task ? valuesFromTask(task) : emptyValues());
    setFieldErrors({});
    setFormError(null);
  }, [open, task]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = createTaskSchema.safeParse({
      title: values.title,
      body: values.body,
      rowId: values.rowId,
      type: values.type,
      status: values.status,
      dueAt: values.dueAt,
      relatedActivityType: values.relatedActivityType,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      if (task) {
        await updateTask(vineyardId, task.id, parsed.data);
      } else {
        await createTask(vineyardId, parsed.data);
      }
      await onSaved();
      onClose();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Could not save the task. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 px-4 py-8"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg"
      >
        <h2 id={titleId} className="text-2xl font-semibold tracking-tight">
          {task ? "Edit task" : "New task"}
        </h2>
        <p className="mt-1 text-muted">
          Link a task to one row, or leave it vineyard-wide.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <Field label="Title" htmlFor="task-title" error={fieldErrors.title}>
            <Input
              id="task-title"
              value={values.title}
              onChange={(event) => setField("title", event.target.value)}
              placeholder="Dormant prune North Slope"
              autoFocus
            />
          </Field>

          <Field
            label="Description"
            htmlFor="task-body"
            error={fieldErrors.body}
          >
            <Textarea
              id="task-body"
              value={values.body}
              onChange={(event) => setField("body", event.target.value)}
              placeholder="Optional details"
            />
          </Field>

          <Field label="Row" htmlFor="task-row" error={fieldErrors.rowId}>
            <select
              id="task-row"
              className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
              value={values.rowId}
              onChange={(event) => setField("rowId", event.target.value)}
            >
              <option value="">Whole vineyard</option>
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} · {row.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="task-type" error={fieldErrors.type}>
              <select
                id="task-type"
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                value={values.type}
                onChange={(event) =>
                  setField("type", event.target.value as TaskType)
                }
              >
                {TASK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TASK_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Status"
              htmlFor="task-status"
              error={fieldErrors.status}
            >
              <select
                id="task-status"
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                value={values.status}
                onChange={(event) =>
                  setField("status", event.target.value as TaskStatus)
                }
              >
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {TASK_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Due date"
              htmlFor="task-due"
              error={fieldErrors.dueAt}
            >
              <Input
                id="task-due"
                type="date"
                value={values.dueAt}
                onChange={(event) => setField("dueAt", event.target.value)}
              />
            </Field>
            <Field
              label="Related work"
              htmlFor="task-activity"
              error={fieldErrors.relatedActivityType}
            >
              <select
                id="task-activity"
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                value={values.relatedActivityType}
                onChange={(event) =>
                  setField("relatedActivityType", event.target.value)
                }
              >
                <option value="">None</option>
                {ACTIVITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {activityLabels[type]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {formError ? (
            <p className="text-sm text-health-red" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : task ? "Save changes" : "Create task"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="mt-1 text-sm text-health-red" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
