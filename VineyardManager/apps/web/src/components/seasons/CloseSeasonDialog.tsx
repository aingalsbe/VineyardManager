import { useEffect, useState } from "react";
import {
  SEASON_ERROR_CODES,
  type CloseSeasonPreview,
  type CloseSeasonResult,
  type SeasonDto,
} from "@vineyard/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, closeSeason, getCloseSeasonPreview } from "@/lib/api";
import { healthSwatch } from "@/lib/health";

export function CloseSeasonDialog({
  vineyardId,
  season,
  open,
  onClose,
  onClosed,
}: {
  vineyardId: string;
  season: SeasonDto | null;
  open: boolean;
  onClose: () => void;
  onClosed: (result: CloseSeasonResult) => Promise<void> | void;
}) {
  const [preview, setPreview] = useState<CloseSeasonPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !season) return;
    const controller = new AbortController();
    setPreview(null);
    setLoading(true);
    setLoadError(null);
    setConfirmed(false);
    setSubmitError(null);

    getCloseSeasonPreview(vineyardId, season.id, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setPreview(data);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Could not load close preview.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, vineyardId, season]);

  async function handleConfirm() {
    if (!season || !preview) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const result = await closeSeason(
        vineyardId,
        season.id,
        preview.previewToken,
      );
      setBusy(false);
      await onClosed(result);
    } catch (err) {
      setBusy(false);
      if (
        err instanceof ApiError &&
        err.code === SEASON_ERROR_CODES.PREVIEW_STALE &&
        err.data &&
        typeof err.data === "object"
      ) {
        setPreview(err.data as CloseSeasonPreview);
        setConfirmed(false);
        setSubmitError(
          "Records changed while this preview was open. The numbers above are refreshed — check them and confirm again.",
        );
        return;
      }
      setSubmitError(
        err instanceof ApiError ? err.message : "Could not close the season.",
      );
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      busy={busy}
      error={submitError}
      title={season ? `Close ${season.year} season` : "Close season"}
      description="Closing puts the vineyard into dormant mode, dismisses remaining open tasks for this season, freezes the Season Summary, and locks this season's records. A power user can reopen it within 30 days."
      actions={
        preview ? (
          <Button
            type="button"
            disabled={busy || !confirmed}
            className="w-full sm:w-auto"
            onClick={() => void handleConfirm()}
          >
            {busy ? "Closing…" : `Close ${preview.year} season`}
          </Button>
        ) : null
      }
    >
      {loading ? (
        <p className="text-sm text-muted" aria-busy="true">
          Loading season preview…
        </p>
      ) : loadError ? (
        <p className="text-sm text-red-800" role="alert">
          {loadError}
        </p>
      ) : preview ? (
        <div className="space-y-4 text-sm">
          {preview.midSeason && preview.midSeasonReason ? (
            <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-foreground">
              <p className="font-semibold text-primary">Mid-season notice</p>
              <p className="mt-1">{preview.midSeasonReason}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs text-muted">Current health</p>
              <p className="mt-1 flex items-center gap-2 font-semibold capitalize">
                <span
                  className={`size-3 rounded-full ${healthSwatch[preview.health.color]}`}
                  aria-hidden
                />
                {preview.health.color} {preview.health.score}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs text-muted">Harvest total</p>
              <p className="mt-1 font-semibold">
                {preview.harvests.totalLb} lb
                {preview.harvests.skippedNonLb > 0
                  ? ` (+${preview.harvests.skippedNonLb} other)`
                  : ""}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-3">
            <p className="font-medium text-foreground">Season work logged</p>
            <p className="mt-1 text-muted">
              {preview.work.waterings} waterings · {preview.work.fertilizing} fertilizing ·{" "}
              {preview.work.pestTreatments} pest · {preview.work.weedTreatments} weed
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background p-3">
            <p className="font-medium text-foreground">
              Open tasks to be dismissed ({preview.openTaskCount})
            </p>
            {preview.openTasks.length === 0 ? (
              <p className="mt-1 text-muted">
                No open tasks in this season.
              </p>
            ) : (
              <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                {preview.openTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-baseline justify-between gap-2 text-xs"
                  >
                    <span className="font-medium text-foreground">
                      {task.title}
                      {task.rowCode ? ` (${task.rowCode})` : ""}
                    </span>
                    <span className="shrink-0 text-muted">
                      Due {task.dueDate}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {preview.untaggedOpenTaskCount > 0 ? (
              <p className="mt-2 text-xs text-muted">
                Note: {preview.untaggedOpenTaskCount} untagged open{" "}
                {preview.untaggedOpenTaskCount === 1 ? "task is" : "tasks are"}{" "}
                not assigned to a season and will not be changed.
              </p>
            ) : null}
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-card p-3">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span className="text-sm text-foreground">
              I have reviewed the preview and want to close the {preview.year}{" "}
              season.
            </span>
          </label>
        </div>
      ) : null}
    </ConfirmDialog>
  );
}
