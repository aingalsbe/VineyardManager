import {
  createHarvestSchema,
  YIELD_UNIT_LABELS,
  YIELD_UNITS,
  type Harvest,
  type Row,
  type YieldUnit,
} from "@vineyard/shared";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, createHarvest, updateHarvest } from "@/lib/api";

type FormValues = {
  rowId: string;
  harvestedAt: string;
  yieldAmount: string;
  yieldUnit: YieldUnit;
  notes: string;
  crew: string;
};

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyValues(rowId: string): FormValues {
  return {
    rowId,
    harvestedAt: todayIsoDate(),
    yieldAmount: "",
    yieldUnit: "lb",
    notes: "",
    crew: "",
  };
}

function valuesFromHarvest(harvest: Harvest): FormValues {
  return {
    rowId: harvest.rowId,
    harvestedAt: harvest.harvestedAt.slice(0, 10),
    yieldAmount: String(harvest.yieldAmount),
    yieldUnit: harvest.yieldUnit,
    notes: harvest.notes ?? "",
    crew: harvest.crew ?? "",
  };
}

export function HarvestFormDialog({
  rows,
  harvest,
  presetRowId,
  open,
  onClose,
  onSaved,
}: {
  rows: Row[];
  harvest: Harvest | null;
  presetRowId?: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const titleId = useId();
  const [values, setValues] = useState<FormValues>(emptyValues(presetRowId ?? ""));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(
      harvest
        ? valuesFromHarvest(harvest)
        : emptyValues(presetRowId ?? ""),
    );
    setFieldErrors({});
    setFormError(null);
  }, [open, harvest, presetRowId]);

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
    const parsed = createHarvestSchema.safeParse({
      rowId: values.rowId,
      harvestedAt: values.harvestedAt,
      yieldAmount: values.yieldAmount,
      yieldUnit: values.yieldUnit,
      notes: values.notes,
      crew: values.crew,
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
      if (harvest) {
        await updateHarvest(harvest.id, parsed.data);
      } else {
        await createHarvest(parsed.data);
      }
      await onSaved();
      onClose();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Could not save the harvest. Try again.",
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
          {harvest ? "Edit harvest" : "Record harvest"}
        </h2>
        <p className="mt-1 text-muted">
          Yield is logged against one row. Vineyard is filled in from that row.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <Field label="Row" htmlFor="harvest-row" error={fieldErrors.rowId}>
            <select
              id="harvest-row"
              className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
              value={values.rowId}
              onChange={(event) => setField("rowId", event.target.value)}
            >
              <option value="">Select a row</option>
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} · {row.name} ({row.variety})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Date"
              htmlFor="harvest-date"
              error={fieldErrors.harvestedAt}
            >
              <Input
                id="harvest-date"
                type="date"
                value={values.harvestedAt}
                onChange={(event) => setField("harvestedAt", event.target.value)}
              />
            </Field>
            <Field label="Crew" htmlFor="harvest-crew" error={fieldErrors.crew}>
              <Input
                id="harvest-crew"
                value={values.crew}
                onChange={(event) => setField("crew", event.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Yield"
              htmlFor="harvest-yield"
              error={fieldErrors.yieldAmount}
            >
              <Input
                id="harvest-yield"
                inputMode="decimal"
                value={values.yieldAmount}
                onChange={(event) => setField("yieldAmount", event.target.value)}
                placeholder="842"
              />
            </Field>
            <Field
              label="Unit"
              htmlFor="harvest-unit"
              error={fieldErrors.yieldUnit}
            >
              <select
                id="harvest-unit"
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                value={values.yieldUnit}
                onChange={(event) =>
                  setField("yieldUnit", event.target.value as YieldUnit)
                }
              >
                {YIELD_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {YIELD_UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Notes" htmlFor="harvest-notes" error={fieldErrors.notes}>
            <Textarea
              id="harvest-notes"
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
              {saving ? "Saving…" : harvest ? "Save changes" : "Record harvest"}
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
