import { useState } from "react";
import type { CloseSeasonResult, CurrentSeasonState } from "@vineyard/shared";
import { CloseSeasonDialog } from "@/components/seasons/CloseSeasonDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
  const [notice, setNotice] = useState<string | null>(null);

  async function handleClosed(result: CloseSeasonResult) {
    setCloseOpen(false);
    setNotice(
      `Closed the ${result.season.year} season. Dismissed ${result.dismissedTaskCount} open ${result.dismissedTaskCount === 1 ? "task" : "tasks"}. Vineyard is now dormant.`,
    );
    await onChanged();
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
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="muted">Dormant</Badge>
              <span className="text-sm text-foreground">
                Dormant since {formatShortDate(current.dormantSince)} (last
                closed: {current.lastClosedSeason.year})
              </span>
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
    </Card>
  );
}
