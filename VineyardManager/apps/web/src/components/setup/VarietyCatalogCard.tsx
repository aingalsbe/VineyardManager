import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, updateVineyard } from "@/lib/api";

export function VarietyCatalogCard({
  vineyardId,
  catalog,
  usedOnRows,
  onSaved,
  readOnly = false,
}: {
  vineyardId: string;
  catalog: string[];
  usedOnRows: string[];
  onSaved: () => Promise<void> | void;
  readOnly?: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const used = new Set(usedOnRows.map((item) => item.trim().toLowerCase()));

  async function persist(next: string[]) {
    setSaving(true);
    setError(null);
    try {
      await updateVineyard(vineyardId, { varietyCatalog: next });
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save varieties");
    } finally {
      setSaving(false);
    }
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a variety");
      return;
    }
    const exists = catalog.some(
      (item) => item.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      setError("That variety is already on the list");
      return;
    }
    setName("");
    await persist([...catalog, trimmed].sort((a, b) => a.localeCompare(b)));
  }

  async function onRemove(entry: string) {
    if (used.has(entry.trim().toLowerCase())) {
      setError(`“${entry}” is still on a row. Change the row first.`);
      return;
    }
    await persist(catalog.filter((item) => item !== entry));
  }

  return (
    <Card>
      <p className="text-sm font-medium text-primary">Varieties</p>
      <CardTitle className="mt-1">Grapes you grow</CardTitle>
      <CardDescription>
        Names only this slice — no lookup. Rows pick from this list.
      </CardDescription>
      {catalog.length === 0 ? (
        <p className="mt-3 text-muted">No varieties yet. Add Norton, Chardonel, …</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {catalog.map((entry) => (
            <li key={entry} className="flex items-center justify-between gap-2">
              <span className="font-medium">{entry}</span>
              {readOnly ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => void onRemove(entry)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {readOnly ? null : (
      <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(event) => void onAdd(event)}>
        <div className="min-w-40 flex-1">
          <Label htmlFor="variety-name">Add variety</Label>
          <Input
            id="variety-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Norton"
            disabled={saving}
          />
        </div>
        <Button type="submit" disabled={saving}>
          Add
        </Button>
      </form>
      )}
      {error ? (
        <p className="mt-2 text-sm font-medium text-health-red" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
