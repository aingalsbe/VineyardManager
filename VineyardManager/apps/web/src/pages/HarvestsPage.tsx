import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatYield, type Harvest } from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { HarvestCard } from "@/components/harvests/HarvestCard";
import { HarvestFormDialog } from "@/components/harvests/HarvestFormDialog";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useHarvests } from "@/hooks/useHarvests";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useVineyardSeasons } from "@/hooks/useVineyardSeasons";
import { ApiError, deleteHarvest, restoreHarvest } from "@/lib/api";
import { buildVarietyLookup, rowLabel } from "@/lib/rowLabel";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function HarvestsPage() {
  const { canOperate, canSetup } = useRoleAccess();
  const seasons = useVineyardSeasons();
  const [seasonFilter, setSeasonFilter] = useState("current");
  const [showRemoved, setShowRemoved] = useState(false);
  const { state, reload } = useHarvests({
    deleted: showRemoved ? "only" : undefined,
    seasonId: showRemoved ? undefined : seasonFilter,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Harvest | null>(null);
  const [presetRowId, setPresetRowId] = useState<string | undefined>();
  const [rowFilter, setRowFilter] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [deleting, setDeleting] = useState<Harvest | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const deleteFocusRef = useRef<HTMLElement | null>(null);

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

  const openDelete = (harvest: Harvest) => {
    setNotice(null);
    setDeleteError(null);
    deleteFocusRef.current = null;
    setDeleting(harvest);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteHarvest(deleting.id);
      setDeleteBusy(false);
      deleteFocusRef.current = headingRef.current;
      setDeleting(null);
      setNotice({
        tone: "ok",
        text: "Harvest removed. You can restore it from Recently removed.",
      });
      await reload({ silent: true });
    } catch (error) {
      setDeleteBusy(false);
      setDeleteError(
        error instanceof ApiError ? error.message : "Could not delete the harvest.",
      );
    }
  };

  const handleRestore = async (harvest: Harvest) => {
    setNotice(null);
    try {
      await restoreHarvest(harvest.id);
      setNotice({ tone: "ok", text: "Harvest restored." });
      await reload({ silent: true });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof ApiError
            ? error.message
            : "Could not restore the harvest.",
      });
    }
  };

  const ready = state.status === "ready";

  const visible = useMemo(() => {
    if (state.status !== "ready") return [];
    if (!rowFilter) return state.harvests;
    return state.harvests.filter((harvest) => harvest.rowId === rowFilter);
  }, [state, rowFilter]);

  const varietyLookup = useMemo(
    () => (state.status === "ready" ? buildVarietyLookup(state.rows) : undefined),
    [state],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        headingRef={headingRef}
        title="Harvests"
        description="Yield logged against a row: amount, unit, date, and who picked."
        actions={
          ready && canOperate ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={showRemoved ? "default" : "outline"}
                onClick={() => {
                  setNotice(null);
                  setShowRemoved((v) => !v);
                }}
              >
                {showRemoved ? "Viewing recently removed" : "Recently removed"}
              </Button>
              {!showRemoved ? (
                <Button type="button" onClick={() => openCreate()}>
                  Record harvest
                </Button>
              ) : null}
            </div>
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
            canSetup ? (
              <Button asChild variant="outline">
                <Link to="/setup">Go to setup</Link>
              </Button>
            ) : undefined
          }
        >
          {canSetup
            ? "Add rows first, then record picks against them."
            : "Ask a power user to set up the vineyard."}
        </EmptyState>
      ) : null}

      {ready ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            {!showRemoved ? (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Season</span>
                <select
                  className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                  value={seasonFilter}
                  onChange={(event) => setSeasonFilter(event.target.value)}
                >
                  <option value="current">Current season</option>
                  <option value="all">All seasons</option>
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.year} ({season.status})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Row</span>
              <select
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
                value={rowFilter}
                onChange={(event) => setRowFilter(event.target.value)}
              >
                <option value="">All rows</option>
                {state.rows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {rowLabel(row)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {notice ? (
            <p
              className={
                notice.tone === "error"
                  ? "mb-4 text-sm text-health-red"
                  : "mb-4 text-sm text-muted"
              }
              role={notice.tone === "error" ? "alert" : "status"}
            >
              {notice.text}
            </p>
          ) : null}

          {state.harvests.length === 0 ? (
            <EmptyState
              title={showRemoved ? "No recently removed harvests" : "No harvests yet"}
              action={
                !showRemoved && canOperate ? (
                  <Button type="button" onClick={() => openCreate()}>
                    Record harvest
                  </Button>
                ) : undefined
              }
            >
              {showRemoved
                ? "Deleted harvests appear here and can be restored."
                : "Log yield against a row after picking."}
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState title="No harvests for this row">
              Clear the filter or record a pick on this row.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {visible.map((harvest) => (
                <li key={harvest.id}>
                  <HarvestCard
                    varietyLookup={varietyLookup}
                    harvest={harvest}
                    onEdit={canOperate && !showRemoved ? openEdit : undefined}
                    onDelete={canOperate && !showRemoved ? openDelete : undefined}
                    onRestore={
                      canOperate && showRemoved
                        ? (item) => void handleRestore(item)
                        : undefined
                    }
                  />
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

          <ConfirmDialog
            open={deleting !== null}
            onClose={() => {
              if (!deleteBusy) setDeleting(null);
            }}
            title="Delete harvest?"
            returnFocusRef={deleteFocusRef}
            busy={deleteBusy}
            error={deleteError}
            description={
              deleting ? (
                <>
                  <span className="block min-w-0 font-medium [overflow-wrap:anywhere] text-foreground">
                    {formatYield(deleting.yieldAmount, deleting.yieldUnit)}
                  </span>
                  <span className="block min-w-0 [overflow-wrap:anywhere]">
                    {formatShortDate(deleting.harvestedAt)}
                    {deleting.row
                      ? ` · ${rowLabel(deleting.row, varietyLookup)}`
                      : ""}
                  </span>
                  <span className="mt-2 block">
                    This removes the harvest from the list and yield totals. It can be
                    restored from Recently removed.
                  </span>
                </>
              ) : null
            }
            actions={
              <Button
                type="button"
                variant="destructive"
                className="w-full sm:w-auto"
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? "Deleting…" : "Delete harvest"}
              </Button>
            }
          />
        </>
      ) : null}
    </div>
  );
}
