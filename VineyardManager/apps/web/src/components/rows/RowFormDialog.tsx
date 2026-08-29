import {
  createRowSchema,
  ROW_STATUSES,
  type Row,
  type RowStatus,
} from "@vineyard/shared";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, createRow, updateRow } from "@/lib/api";

type FormValues = {
  code: string;
  name: string;
  variety: string;
  lengthFeet: string;
  lengthInches: string;
  vineCount: string;
  plantedYear: string;
  status: RowStatus;
  notes: string;
};

function emptyValues(): FormValues {
  return {
    code: "",
    name: "",
    variety: "",
    lengthFeet: "",
    lengthInches: "0",
    vineCount: "",
    plantedYear: String(new Date().getFullYear()),
    status: "active",
    notes: "",
  };
}

function valuesFromRow(row: Row): FormValues {
  return {
    code: row.code,
    name: row.name,
    variety: row.variety,
    lengthFeet: String(row.lengthFeet),
    lengthInches: String(row.lengthInches),
    vineCount: String(row.vineCount),
    plantedYear: String(row.plantedYear),
    status: row.status,
    notes: row.notes ?? "",
  };
}

export function RowFormDialog({
  vineyardId,
  row,
  varietyOptions = [],
  open,
  onClose,
  onSaved,
}: {
  vineyardId: string;
  row: Row | null;
  varietyOptions?: string[];
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
    setValues(row ? valuesFromRow(row) : emptyValues());
    setFieldErrors({});
    setFormError(null);
  }, [open, row]);

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
    const parsed = createRowSchema.safeParse({
      code: values.code,
      name: values.name,
      variety: values.variety,
      lengthFeet: values.lengthFeet,
      lengthInches: values.lengthInches,
      vineCount: values.vineCount,
      plantedYear: values.plantedYear,
      status: values.status,
      notes: values.notes,
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
      if (row) {
        await updateRow(vineyardId, row.id, parsed.data);
      } else {
        await createRow(vineyardId, parsed.data);
      }
      await onSaved();
      onClose();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Could not save the row. Try again.",
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
          {row ? "Edit row" : "New row"}
        </h2>
        <p className="mt-1 text-muted">
          Length is feet and leftover inches (0–11). Vine count is a whole
          number.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" htmlFor="row-code" error={fieldErrors.code}>
              <Input
                id="row-code"
                value={values.code}
                onChange={(event) => setField("code", event.target.value)}
                placeholder="NS1"
                autoFocus
              />
            </Field>
            <Field label="Name" htmlFor="row-name" error={fieldErrors.name}>
              <Input
                id="row-name"
                value={values.name}
                onChange={(event) => setField("name", event.target.value)}
                placeholder="North South 1"
              />
            </Field>
          </div>

          <Field label="Variety" htmlFor="row-variety" error={fieldErrors.variety}>
            <Input
              id="row-variety"
              list="row-variety-options"
              value={values.variety}
              onChange={(event) => setField("variety", event.target.value)}
              placeholder="Norton"
            />
            {varietyOptions.length > 0 ? (
              <datalist id="row-variety-options">
                {varietyOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            ) : null}
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Length (ft)"
              htmlFor="row-feet"
              error={fieldErrors.lengthFeet}
            >
              <Input
                id="row-feet"
                inputMode="numeric"
                value={values.lengthFeet}
                onChange={(event) => setField("lengthFeet", event.target.value)}
              />
            </Field>
            <Field
              label="Length (in)"
              htmlFor="row-inches"
              error={fieldErrors.lengthInches}
            >
              <Input
                id="row-inches"
                inputMode="numeric"
                value={values.lengthInches}
                onChange={(event) => setField("lengthInches", event.target.value)}
              />
            </Field>
            <Field
              label="Vines"
              htmlFor="row-vines"
              error={fieldErrors.vineCount}
            >
              <Input
                id="row-vines"
                inputMode="numeric"
                value={values.vineCount}
                onChange={(event) => setField("vineCount", event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Planting year"
              htmlFor="row-year"
              error={fieldErrors.plantedYear}
            >
              <Input
                id="row-year"
                inputMode="numeric"
                value={values.plantedYear}
                onChange={(event) => setField("plantedYear", event.target.value)}
              />
            </Field>
            <Field label="Status" htmlFor="row-status" error={fieldErrors.status}>
              <select
                id="row-status"
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-base capitalize"
                value={values.status}
                onChange={(event) =>
                  setField("status", event.target.value as RowStatus)
                }
              >
                {ROW_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Notes" htmlFor="row-notes" error={fieldErrors.notes}>
            <Textarea
              id="row-notes"
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
              {saving ? "Saving…" : row ? "Save changes" : "Create row"}
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
