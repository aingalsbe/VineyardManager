import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Harvest } from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { HarvestCard } from "@/components/harvests/HarvestCard";
import { HarvestFormDialog } from "@/components/harvests/HarvestFormDialog";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useHarvests } from "@/hooks/useHarvests";

export function HarvestsPage() {
  const { state, reload } = useHarvests();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Harvest | null>(null);
  const [presetRowId, setPresetRowId] = useState<string | undefined>();
  const [rowFilter, setRowFilter] = useState("");

  const openCreate = (rowId?: string) => {
    setEditing(null);
    setPresetRowId(rowId);
    setDialogOpen(true);
  };

  const openEdit = (harvest: Harvest) => {
    setEditing(harvest);
    setPresetRowId(undefined);
    setDialogOpen(true);
  };

  const ready = state.status === "ready";

  const visible = useMemo(() => {
    if (state.status !== "ready") return [];
    if (!rowFilter) return state.harvests;
    return state.harvests.filter((harvest) => harvest.rowId === rowFilter);
  }, [state, rowFilter]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Harvests"
        description="Yield logged against a row: amount, unit, date, and who picked."
        actions={
          ready ? (
            <Button type="button" onClick={() => openCreate()}>
              Record harvest
            </Button>
          ) : null
        }
      />

      {state.status === "loading" ? (
        <div className="space-y-3" aria-busy="true">
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <p className="sr-only">Loading harvests</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <EmptyState
          title="Could not load harvests"
          action={
            <Button type="button" onClick={() => void reload()}>
              Try again
            </Button>
          }
        >
          {state.message}
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
          Add rows first, then record picks against them.
        </EmptyState>
      ) : null}

      {ready ? (
        <>
          <label className="mb-5 block max-w-sm">
            <span className="mb-1 block text-sm font-medium">Row</span>
            <select
              className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
              value={rowFilter}
              onChange={(event) => setRowFilter(event.target.value)}
            >
              <option value="">All rows</option>
              {state.rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} · {row.name}
                </option>
              ))}
            </select>
          </label>

          {state.harvests.length === 0 ? (
            <EmptyState
              title="No harvests yet"
              action={
                <Button type="button" onClick={() => openCreate()}>
                  Record harvest
                </Button>
              }
            >
              Log yield against a row after picking.
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState title="No harvests for this row">
              Clear the filter or record a pick on this row.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {visible.map((harvest) => (
                <li key={harvest.id}>
                  <HarvestCard harvest={harvest} onEdit={openEdit} />
                </li>
              ))}
            </ul>
          )}

          <HarvestFormDialog
            rows={state.rows}
            harvest={editing}
            presetRowId={presetRowId}
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            onSaved={() => reload({ silent: true })}
          />
        </>
      ) : null}
    </div>
  );
}
