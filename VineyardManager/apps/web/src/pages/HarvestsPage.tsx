import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatYield, type Harvest } from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import {
  ActionNotice,
  ClosedSeasonNotice,
  DeleteItemDescription,
  RecentlyRemovedSubtitle,
  RecentlyRemovedToggle,
  type ListNotice,
} from "@/components/ListChrome";
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
import { formatShortDate } from "@/lib/format";
import { buildVarietyLookup, rowLabel } from "@/lib/rowLabel";
import {
  closedSeasonNotice,
  deleteDialogTitle,
  deletedNotice,
  resolveSeasonFilter,
  seasonEmptyState,
} from "@/lib/seasonCopy";

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
  const [notice, setNotice] = useState<ListNotice | null>(null);
  const selectedSeason = resolveSeasonFilter(seasons, seasonFilter);
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
      const removedId = deleting.id;
      await deleteHarvest(removedId);
      setDeleteBusy(false);
      deleteFocusRef.current = headingRef.current;
      setDeleting(null);
      setNotice({
        tone: "ok",
        text: deletedNotice("harvest"),
        undo: async () => {
          try {
            await restoreHarvest(removedId);
            setNotice({ tone: "ok", text: "Harvest restored." });
            await reload({ silent: true });
          } catch (error) {
            setNotice({
              tone: "error",
              text: error instanceof ApiError ? error.message : "Could not restore the harvest.",
            });
          }
        },
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
              <RecentlyRemovedToggle
                showingRemoved={showRemoved}
                listName="harvests"
                onToggle={() => {
                  setNotice(null);
                  setShowRemoved((v) => !v);
                }}
              />
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

          {showRemoved ? <RecentlyRemovedSubtitle /> : null}

          <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />

          {!showRemoved && selectedSeason ? (
            <ClosedSeasonNotice text={closedSeasonNotice(selectedSeason)} />
          ) : null}

          {state.harvests.length === 0 ? (
            showRemoved ? (
              <EmptyState title="No recently removed harvests">
                Deleted harvests appear here and can be restored.
              </EmptyState>
            ) : (
              (() => {
                const empty = seasonEmptyState("harvests", seasonFilter, selectedSeason);
                return (
                  <EmptyState
                    title={empty.title}
                    action={
                      empty.showAllSeasons || canOperate ? (
                        <div className="flex flex-wrap gap-2">
                          {empty.showAllSeasons ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setSeasonFilter("all")}
                            >
                              Show all seasons
                            </Button>
                          ) : null}
                          {canOperate && selectedSeason?.status !== "closed" ? (
                            <Button type="button" onClick={() => openCreate()}>
                              Record harvest
                            </Button>
                          ) : null}
                        </div>
                      ) : undefined
                    }
                  >
                    {empty.showAllSeasons
                      ? "Harvests from other seasons are under All seasons."
                      : "Log yield against a row after picking."}
                  </EmptyState>
                );
              })()
            )
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
            title={deleteDialogTitle("harvest")}
            returnFocusRef={deleteFocusRef}
            busy={deleteBusy}
            error={deleteError}
            description={
              deleting ? (
                <DeleteItemDescription
                  name={formatYield(deleting.yieldAmount, deleting.yieldUnit)}
                  detail={`${formatShortDate(deleting.harvestedAt)}${
                    deleting.row ? ` · ${rowLabel(deleting.row, varietyLookup)}` : ""
                  }`}
                  extra={
                    <span className="mt-2 block">
                      It leaves the harvest list and yield totals.
                    </span>
                  }
                />
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
