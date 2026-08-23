import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPES,
  WATERING_METHODS,
  createActivitySchema,
  type ActivityType,
  type Row,
  type WateringMethod,
} from "@vineyard/shared";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, createActivity } from "@/lib/api";

type FormValues = {
  activityType: ActivityType;
  scopeType: "vineyard" | "row";
  rowId: string;
  performedAt: string;
  notes: string;
  durationMin: string;
  method: WateringMethod;
};

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyValues(presetType?: ActivityType): FormValues {
  return {
    activityType: presetType ?? "pruning",
    scopeType: "row",
    rowId: "",
    performedAt: todayIsoDate(),
    notes: "",
    durationMin: "",
    method: "drip",
  };
}

export function ActivityFormDialog({
  vineyardId,
  rows,
  presetType,
  open,
  onClose,
  onSaved,
}: {
  vineyardId: string;
  rows: Row[];
  presetType?: ActivityType;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const titleId = useId();
  const [values, setValues] = useState<FormValues>(emptyValues(presetType));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(emptyValues(presetType));
    setFieldErrors({});
    setFormError(null);
  }, [open, presetType]);

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

    if (values.scopeType === "row" && !values.rowId) {
      setFieldErrors({ rowId: "Select a row" });
      return;
    }

    const details: Record<string, unknown> = {};
    if (values.notes.trim()) details.notes = values.notes.trim();
    if (values.activityType === "watering") {
      if (values.durationMin) {
        details.durationMin = Number(values.durationMin);
      }
      details.method = values.method;
    }

    const parsed = createActivitySchema.safeParse({
      scopeType: values.scopeType,
      scopeId: values.scopeType === "vineyard" ? vineyardId : values.rowId,
      activityType: values.activityType,
      performedAt: values.performedAt,
      details,
      source: "manual",
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
      await createActivity(vineyardId, parsed.data);
      await onSaved();
      onClose();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Could not save the work log. Try again.",
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
          Log work
        </h2>
        <p className="mt-1 text-muted">
          Record what happened on the vineyard or a single row.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <Field
            label="Type"
            htmlFor="activity-type"
            error={fieldErrors.activityType}
          >
            <select
              id="activity-type"
              className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
              value={values.activityType}
              onChange={(event) =>
                setField("activityType", event.target.value as ActivityType)
              }
            >
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACTIVITY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>

          {values.activityType === "harvest" ? (
            <p className="text-sm text-muted">
              Yield still lives on Harvests. This is only a work note.
            </p>
          ) : null}

          <Field label="Scope" htmlFor="activity-scope" error={fieldErrors.scopeType}>
            <select
              id="activity-scope"
              className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
              value={values.scopeType}
              onChange={(event) =>
                setField("scopeType", event.target.value as "vineyard" | "row")
              }
            >
              <option value="vineyard">Whole vineyard</option>
              <option value="row">Specific row</option>
            </select>
          </Field>

          {values.scopeType === "row" ? (
            <Field label="Row" htmlFor="activity-row" error={fieldErrors.rowId}>
              <select
                id="activity-row"
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                value={values.rowId}
                onChange={(event) => setField("rowId", event.target.value)}
              >
                <option value="">Select a row</option>
                {rows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.code} · {row.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field label="Date" htmlFor="activity-date" error={fieldErrors.performedAt}>
            <Input
              id="activity-date"
              type="date"
              value={values.performedAt}
              onChange={(event) => setField("performedAt", event.target.value)}
            />
          </Field>

          {values.activityType === "watering" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duration (min)" htmlFor="activity-duration">
                <Input
                  id="activity-duration"
                  inputMode="numeric"
                  value={values.durationMin}
                  onChange={(event) => setField("durationMin", event.target.value)}
                  placeholder="45"
                />
              </Field>
              <Field label="Method" htmlFor="activity-method">
                <select
                  id="activity-method"
                  className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                  value={values.method}
                  onChange={(event) =>
                    setField("method", event.target.value as WateringMethod)
                  }
                >
                  {WATERING_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : null}

          <Field label="Notes" htmlFor="activity-notes">
            <Textarea
              id="activity-notes"
              value={values.notes}
              onChange={(event) => setField("notes", event.target.value)}
              placeholder="Optional"
            />
          </Field>

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
              {saving ? "Saving…" : "Log work"}
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
