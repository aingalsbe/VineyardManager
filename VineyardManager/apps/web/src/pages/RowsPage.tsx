import { useState } from "react";
import { Link } from "react-router-dom";
import type { Row } from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { HarvestFormDialog } from "@/components/harvests/HarvestFormDialog";
import { RowCard } from "@/components/rows/RowCard";
import { RowFormDialog } from "@/components/rows/RowFormDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useVineyardRows } from "@/hooks/useVineyardRows";

export function RowsPage() {
  const { state, reload } = useVineyardRows();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [harvestRow, setHarvestRow] = useState<Row | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    setDialogOpen(true);
  };

  const vineyardReady = state.status === "ready";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Rows"
        description={
          vineyardReady
            ? `${state.vineyard.name} — each row has a variety, length, and vine count.`
            : "Rows are the working units of the vineyard: variety, length, and how many vines are on the wire."
        }
        actions={
          vineyardReady ? (
            <Button type="button" onClick={openCreate}>
              New row
            </Button>
          ) : null
        }
      />

      {state.status === "loading" ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <Card className="min-h-40 animate-pulse bg-card/70" />
          <Card className="min-h-40 animate-pulse bg-card/70" />
          <Card className="min-h-40 animate-pulse bg-card/70" />
          <p className="sr-only">Loading rows</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <EmptyState
          title="Could not load rows"
          action={
            <Button type="button" onClick={() => void reload()}>
              Try again
            </Button>
          }
        >
          {state.message} Confirm the API is running on http://localhost:3001
          and that you have applied migrations and seed data.
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
          Create a vineyard, then run{" "}
          <code className="text-foreground">pnpm db:seed</code> to load sample
          rows.
        </EmptyState>
      ) : null}

      {vineyardReady && state.rows.length === 0 ? (
        <EmptyState
          title="No rows yet"
          action={
            <Button type="button" onClick={openCreate}>
              New row
            </Button>
          }
        >
          {state.vineyard.name} has no rows yet. Add the first one.
        </EmptyState>
      ) : null}

      {vineyardReady && state.rows.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {state.rows.map((row) => (
            <li key={row.id}>
              <RowCard
                row={row}
                onEdit={openEdit}
                onRecordHarvest={setHarvestRow}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {vineyardReady ? (
        <>
          <RowFormDialog
            vineyardId={state.vineyard.id}
            row={editing}
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            onSaved={() => reload({ silent: true })}
          />
          <HarvestFormDialog
            rows={state.rows}
            harvest={null}
            presetRowId={harvestRow?.id}
            open={harvestRow !== null}
            onClose={() => setHarvestRow(null)}
            onSaved={() => reload({ silent: true })}
          />
        </>
      ) : null}
    </div>
  );
}
