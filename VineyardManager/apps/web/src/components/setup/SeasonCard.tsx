import { useState } from "react";
import { Link } from "react-router-dom";
import type { CloseSeasonResult, CurrentSeasonState } from "@vineyard/shared";
import { CloseSeasonDialog } from "@/components/seasons/CloseSeasonDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, reopenSeason } from "@/lib/api";

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function reopenDaysRemaining(reopenableUntil: string | null | undefined): number {
  if (!reopenableUntil) return 0;
  const ms = new Date(reopenableUntil).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function SeasonCard({
  vineyardId,
  current,
  loading,
  error,
  canSetup,
  onChanged,
}: {
  vineyardId: string;
  current: CurrentSeasonState | null;
  loading: boolean;
  error: string | null;
  canSetup: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lastClosed = current?.dormant ? current.lastClosedSeason : null;
  const daysLeft = reopenDaysRemaining(lastClosed?.reopenableUntil);
  const canReopen = Boolean(canSetup && lastClosed && daysLeft > 0);

  async function handleClosed(result: CloseSeasonResult) {
    setCloseOpen(false);
    setNotice(
      `Closed the ${result.season.year} season. Dismissed ${result.dismissedTaskCount} open ${result.dismissedTaskCount === 1 ? "task" : "tasks"}. Vineyard is now dormant.`,
    );
    await onChanged();
  }

  async function handleReopen() {
    if (!lastClosed) return;
    setReopenBusy(true);
    setReopenError(null);
    try {
      const result = await reopenSeason(vineyardId, lastClosed.id);
      setReopenBusy(false);
      setReopenOpen(false);
      setNotice(
        `Reopened the ${result.season.year} season. Dismissed tasks stay dismissed; records are unlocked for editing.`,
      );
      await onChanged();
    } catch (err) {
      setReopenBusy(false);
      setReopenError(
        err instanceof ApiError ? err.message : "Could not reopen the season.",
      );
    }
  }

  return (
    <Card>
      <p className="text-sm font-medium text-primary">Season</p>
      <CardTitle className="mt-1">Growing season</CardTitle>
      <CardDescription>
        Close a season when harvest wraps up to freeze the summary and put the
        vineyard into winter dormancy.
      </CardDescription>

      {loading ? (
        <p className="mt-3 text-sm text-muted" aria-busy="true">
          Loading season status…
        </p>
      ) : error ? (
        <p className="mt-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : current ? (
        <div className="mt-4 space-y-3">
          {current.dormant ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="muted">Dormant</Badge>
                <span className="text-sm text-foreground">
                  Dormant since {formatShortDate(current.dormantSince)} (last
                  closed: {current.lastClosedSeason.year})
                </span>
              </div>
              {daysLeft > 0 ? (
                <p className="text-xs text-muted">
                  Reopenable for {daysLeft}{" "}
                  {daysLeft === 1 ? "more day" : "more days"} (until{" "}
                  {formatShortDate(current.lastClosedSeason.reopenableUntil)}).
                </p>
              ) : (
                <p className="text-xs text-muted">
                  The 30-day reopen window for {current.lastClosedSeason.year}{" "}
                  has ended.
                </p>
              )}
            </div>
          ) : current.season ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">Active</Badge>
              <span className="text-base font-semibold text-foreground">
                {current.season.year} season
              </span>
              {current.season.startedAt ? (
                <span className="text-sm text-muted">
                  Started {formatShortDate(current.season.startedAt)}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">
              No active season yet. Logging work or creating a task starts the
              current year automatically.
            </p>
          )}

          {current.dormant && current.plannedSeason ? (
            <p className="text-sm text-muted">
              Next season ({current.plannedSeason.year}) already has planned
              records waiting.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!current.dormant && current.season && canSetup ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNotice(null);
                  setCloseOpen(true);
                }}
              >
                Close {current.season.year} season
              </Button>
            ) : null}
            {canReopen && lastClosed ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNotice(null);
                  setReopenError(null);
                  setReopenOpen(true);
                }}
              >
                Reopen {lastClosed.year} season
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link to="/seasons">Past seasons</Link>
            </Button>
          </div>

          {!canSetup ? (
            <p className="text-xs text-muted">
              Only a power user can close, reopen, or start a season.
            </p>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <p className="mt-3 text-sm font-medium text-primary" role="status">
          {notice}
        </p>
      ) : null}

      <CloseSeasonDialog
        vineyardId={vineyardId}
        season={current && !current.dormant ? current.season : null}
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onClosed={handleClosed}
      />

      <ConfirmDialog
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        busy={reopenBusy}
        error={reopenError}
        title={lastClosed ? `Reopen ${lastClosed.year} season` : "Reopen season"}
        description="Reopening unlocks this season's tasks, harvests, and work log for editing and resumes active health scoring. Tasks dismissed when closing stay dismissed, and any records logged into next season stay in next season."
        actions={
          <Button
            type="button"
            disabled={reopenBusy}
            className="w-full sm:w-auto"
            onClick={() => void handleReopen()}
          >
            {reopenBusy
              ? "Reopening…"
              : `Reopen ${lastClosed?.year ?? ""} season`}
          </Button>
        }
      />
    </Card>
  );
}
