import { useState, type FormEvent } from "react";
import {
  VARIETY_HARVEST_TIMINGS,
  VARIETY_HARVEST_TIMING_LABELS,
  suggestVarietyHarvestTiming,
  type VarietyHarvestTags,
  type VarietyHarvestTiming,
} from "@vineyard/shared";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, updateVineyard } from "@/lib/api";

export function VarietyCatalogCard({
  vineyardId,
  catalog,
  harvestTags = {},
  usedOnRows,
  onSaved,
  readOnly = false,
}: {
  vineyardId: string;
  catalog: string[];
  harvestTags?: VarietyHarvestTags;
  usedOnRows: string[];
  onSaved: () => Promise<void> | void;
  readOnly?: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const used = new Set(usedOnRows.map((item) => item.trim().toLowerCase()));

  async function persist(
    nextCatalog: string[],
    nextTags?: VarietyHarvestTags,
  ) {
    setSaving(true);
    setError(null);
    try {
      await updateVineyard(vineyardId, {
        varietyCatalog: nextCatalog,
        ...(nextTags !== undefined ? { varietyHarvestTags: nextTags } : {}),
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save varieties");
    } finally {
      setSaving(false);
    }
  }

  async function persistTag(
    varietyName: string,
    timing: VarietyHarvestTiming | "",
  ) {
    const nextTags: VarietyHarvestTags = { ...harvestTags };
    if (!timing) delete nextTags[varietyName];
    else nextTags[varietyName] = timing;
    await persist(catalog, nextTags);
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
    // E4: Adding a variety never auto-saves a suggested harvest timing tag.
    await persist([...catalog, trimmed].sort((a, b) => a.localeCompare(b)));
  }

  async function onRemove(entry: string) {
    if (used.has(entry.trim().toLowerCase())) {
      setError(`“${entry}” is still on a row. Change the row first.`);
      return;
    }
    const nextTags = { ...harvestTags };
    delete nextTags[entry];
    await persist(
      catalog.filter((item) => item !== entry),
      nextTags,
    );
  }

  return (
    <Card>
      <p className="text-sm font-medium text-primary">Varieties</p>
      <CardTitle className="mt-1">Grapes you grow</CardTitle>
      <CardDescription>
        Rows pick from this list. Confirm early, mid, or late harvest timing to
        guide each variety’s sugar-check window when you start the next season.
      </CardDescription>
      {catalog.length === 0 ? (
        <p className="mt-3 text-muted">No varieties yet. Add Norton, Chardonel, …</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {catalog.map((entry) => {
            const currentTag = harvestTags[entry] ?? "";
            const suggestion = suggestVarietyHarvestTiming(entry);
            return (
              <li
                key={entry}
                className="grid gap-2 rounded-lg border border-border/70 bg-background/40 p-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <span className="font-medium">{entry}</span>
                  {suggestion && !currentTag ? (
                    <p className="text-xs text-muted">
                      Suggested: {VARIETY_HARVEST_TIMING_LABELS[suggestion.timing]}{" "}
                      ({suggestion.source})
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-nowrap items-center gap-2">
                  {!readOnly && suggestion && currentTag !== suggestion.timing ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="smTouch"
                      disabled={saving}
                      onClick={() => void persistTag(entry, suggestion.timing)}
                    >
                      Use {VARIETY_HARVEST_TIMING_LABELS[suggestion.timing]}
                    </Button>
                  ) : null}
                  <select
                    aria-label={`Harvest timing for ${entry}`}
                    className="h-11 rounded-md border border-border bg-card px-2 text-sm sm:h-9 disabled:cursor-not-allowed disabled:bg-background disabled:opacity-60"
                    value={currentTag}
                    disabled={readOnly || saving}
                    onChange={(event) =>
                      void persistTag(
                        entry,
                        event.target.value as VarietyHarvestTiming | "",
                      )
                    }
                  >
                    <option value="">Timing unset</option>
                    {VARIETY_HARVEST_TIMINGS.map((timing) => (
                      <option key={timing} value={timing}>
                        {VARIETY_HARVEST_TIMING_LABELS[timing]}
                      </option>
                    ))}
                  </select>
                  {readOnly ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="smTouch"
                      disabled={saving}
                      onClick={() => void onRemove(entry)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {readOnly && catalog.length > 0 ? (
        <p className="mt-3 text-sm text-muted">
          Only a power user can change harvest timing.
        </p>
      ) : null}
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
