import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Row } from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { HarvestFormDialog } from "@/components/harvests/HarvestFormDialog";
import { RowCard } from "@/components/rows/RowCard";
import { RowDeleteDialog } from "@/components/rows/RowDeleteDialog";
import { RowFormDialog } from "@/components/rows/RowFormDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVineyardHealth } from "@/hooks/useVineyardHealth";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useVineyardRows } from "@/hooks/useVineyardRows";
import { ApiError, restoreRow, type DeleteRowResult } from "@/lib/api";
import { pluralize } from "@/lib/pluralize";
import { rowLabel } from "@/lib/rowLabel";

/** Past-tense notice built from the DELETE result (not the server message). */
function rowDeletedNotice(result: DeleteRowResult, label: string): string {
  const parts = [
    result.mode === "hard"
      ? `Deleted ${label}.`
      : `Removed ${label}. Its history is kept, and you can restore it from Recently removed.`,
  ];
  if (result.dismissedTaskCount > 0) {
    parts.push(`Dismissed ${pluralize(result.dismissedTaskCount, "open task")}.`);
  } else if (result.counts.openTasks > 0) {
    const kept = result.counts.openTasks;
    parts.push(
      `${pluralize(kept, "open task")} ${kept === 1 ? "stays" : "stay"} open.`,
    );
  }
  return parts.join(" ");
}

export function RowsPage() {
  const { canOperate, canSetup } = useRoleAccess();
  const [showRemoved, setShowRemoved] = useState(false);
  const { state, reload } = useVineyardRows({
    deleted: showRemoved ? "only" : undefined,
  });
  const health = useVineyardHealth();
  const [searchParams] = useSearchParams();
  const highlightedCode = searchParams.get("row");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [harvestRow, setHarvestRow] = useState<Row | null>(null);
  const [rowNotice, setRowNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  const [deleting, setDeleting] = useState<Row | null>(null);
  const [renamingRow, setRenamingRow] = useState<Row | null>(null);
  const [newCode, setNewCode] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Soft vs hard wording comes from the API (delete-preview in the dialog,
  // then the DELETE response message here), never guessed client-side.
  const handleDeleted = async (result: DeleteRowResult, label: string) => {
    setDeleting(null);
    setRowNotice({ tone: "ok", text: rowDeletedNotice(result, label) });
    await reload({ silent: true });
    void health.reload({ silent: true });
  };

  const handleRestore = async (row: Row) => {
    if (state.status !== "ready") return;
    setRowNotice(null);
    try {
      const restored = await restoreRow(state.vineyard.id, row.id);
      setRowNotice({
        tone: "ok",
        text: `Restored ${rowLabel(restored)}. It is unplaced on the map — place it in Setup if needed.`,
      });
      await reload({ silent: true });
      void health.reload({ silent: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === "ROW_CODE_TAKEN") {
        const base =
          row.preDeleteCode ||
          row.code.replace(/__old_[0-9a-f]{8}$/i, "") ||
          "";
        setRenamingRow(row);
        setNewCode(base ? `${base}-2` : "");
        setRestoreError(error.message);
        return;
      }
      setRowNotice({
        tone: "error",
        text:
          error instanceof ApiError
            ? error.message
            : "Could not restore the row.",
      });
    }
  };

  const confirmRestoreWithCode = async () => {
    if (state.status !== "ready" || !renamingRow) return;
    const trimmed = newCode.trim();
    if (!trimmed) {
      setRestoreError("Enter a new row code.");
      return;
    }
    setRestoreBusy(true);
    setRestoreError(null);
    try {
      const restored = await restoreRow(state.vineyard.id, renamingRow.id, trimmed);
      setRestoreBusy(false);
      setRenamingRow(null);
      setRowNotice({
        tone: "ok",
        text: `Restored ${rowLabel(restored)}. It is unplaced on the map — place it in Setup if needed.`,
      });
      await reload({ silent: true });
      void health.reload({ silent: true });
    } catch (error) {
      setRestoreBusy(false);
      setRestoreError(
        error instanceof ApiError ? error.message : "Could not restore the row.",
      );
    }
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    setDialogOpen(true);
  };

  const vineyardReady = state.status === "ready";

  useEffect(() => {
    if (!highlightedCode || !vineyardReady || showRemoved) return;
    document
      .getElementById(`row-${highlightedCode}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightedCode, vineyardReady, showRemoved]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        headingRef={headingRef}
        title="Rows"
        description={
          vineyardReady
            ? `${state.vineyard.name} — each row has a variety, length, and vine count.`
            : "Rows are the working units of the vineyard: variety, length, and how many vines are on the wire."
        }
        actions={
          vineyardReady && canOperate ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={showRemoved ? "default" : "outline"}
                onClick={() => {
                  setRowNotice(null);
                  setShowRemoved((v) => !v);
                }}
              >
                {showRemoved ? "Viewing recently removed" : "Recently removed"}
              </Button>
              {!showRemoved ? (
                <Button type="button" onClick={openCreate}>
                  New row
                </Button>
              ) : null}
            </div>
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
            canSetup ? (
              <Button asChild variant="outline">
                <Link to="/setup">Go to setup</Link>
              </Button>
            ) : undefined
          }
        >
          {canSetup ? (
            <>
              Create a vineyard, then run{" "}
              <code className="text-foreground">pnpm db:seed</code> to load sample
              rows.
            </>
          ) : (
            "Ask a power user to set up the vineyard."
          )}
        </EmptyState>
      ) : null}

      {vineyardReady && state.rows.length === 0 ? (
        <EmptyState
          title={showRemoved ? "No recently removed rows" : "No rows yet"}
          action={
            !showRemoved && canOperate ? (
              <Button type="button" onClick={openCreate}>
                New row
              </Button>
            ) : undefined
          }
        >
          {showRemoved
            ? "Rows removed with history appear here and can be restored."
            : `${state.vineyard.name} has no rows yet. Add the first one.`}
        </EmptyState>
      ) : null}

      {rowNotice ? (
        <p
          className={
            rowNotice.tone === "error"
              ? "mb-4 min-w-0 text-sm [overflow-wrap:anywhere] text-red-700"
              : "mb-4 min-w-0 text-sm [overflow-wrap:anywhere] text-muted"
          }
          role={rowNotice.tone === "error" ? "alert" : "status"}
        >
          {rowNotice.text}
        </p>
      ) : null}

      {vineyardReady && state.rows.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {state.rows.map((row) => {
            const rowHealth =
              !showRemoved && health.state.status === "ready"
                ? health.state.health.rows.find(
                    (item) => item.rowId === row.id,
                  )
                : undefined;
            return (
              <li key={row.id} id={`row-${row.code}`}>
                <RowCard
                  row={row}
                  onEdit={canOperate && !showRemoved ? openEdit : undefined}
                  onRecordHarvest={
                    canOperate && !showRemoved ? setHarvestRow : undefined
                  }
                  onDelete={
                    canOperate && !showRemoved
                      ? (item) => {
                          setRowNotice(null);
                          setDeleting(item);
                        }
                      : undefined
                  }
                  onRestore={
                    canOperate && showRemoved
                      ? (item) => void handleRestore(item)
                      : undefined
                  }
                  health={
                    rowHealth
                      ? {
                          color: rowHealth.color,
                          reason: rowHealth.reasons[0]?.message,
                        }
                      : null
                  }
                  highlighted={!showRemoved && highlightedCode === row.code}
                />
              </li>
            );
          })}
        </ul>
      ) : null}

      {vineyardReady ? (
        <>
          <RowFormDialog
            vineyardId={state.vineyard.id}
            row={editing}
            varietyOptions={[
              ...new Set([
                ...state.vineyard.varietyCatalog,
                ...state.rows.map((row) => row.variety),
              ]),
            ].sort((a, b) => a.localeCompare(b))}
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            onSaved={() => reload({ silent: true })}
          />
          {canOperate ? (
            <RowDeleteDialog
              vineyardId={state.vineyard.id}
              row={deleting}
              onClose={() => setDeleting(null)}
              onDeleted={(result) =>
                handleDeleted(result, deleting ? rowLabel(deleting) : "Row")
              }
              successFocusRef={headingRef}
            />
          ) : null}
          <HarvestFormDialog
            rows={state.rows}
            harvest={null}
            presetRowId={harvestRow?.id}
            open={harvestRow !== null}
            onClose={() => setHarvestRow(null)}
            onSaved={() => reload({ silent: true })}
          />
          <ConfirmDialog
            open={renamingRow !== null}
            onClose={() => {
              if (!restoreBusy) setRenamingRow(null);
            }}
            title="Choose a new row code"
            busy={restoreBusy}
            error={restoreError}
            description="Another active row is already using that code. Pick a different code to restore this row."
            actions={
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={restoreBusy}
                onClick={() => void confirmRestoreWithCode()}
              >
                {restoreBusy ? "Restoring…" : "Restore row"}
              </Button>
            }
          >
            <div>
              <Label htmlFor="restore-row-code">New row code</Label>
              <Input
                id="restore-row-code"
                value={newCode}
                onChange={(event) => setNewCode(event.target.value)}
                placeholder="e.g. L1-2"
                disabled={restoreBusy}
              />
            </div>
          </ConfirmDialog>
        </>
      ) : null}
    </div>
  );
}
