import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { SEASON_STATUS_LABELS, type SeasonDto } from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import type { AppOutletContext } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError, listSeasons } from "@/lib/api";
import { seasonClosedLine, seasonStartLine } from "@/lib/seasonCopy";

export function PastSeasonsPage() {
  const { vineyard, vineyardStatus, vineyardError, reloadVineyard } =
    useOutletContext<AppOutletContext>();
  const [seasons, setSeasons] = useState<SeasonDto[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (vineyardStatus === "loading") {
      setStatus("loading");
      return;
    }
    if (!vineyard) {
      setSeasons([]);
      setStatus(vineyardStatus === "error" ? "error" : "ready");
      setError(vineyardError ?? null);
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    listSeasons(vineyard.id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setSeasons(data);
          setStatus("ready");
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof ApiError ? err.message : "Could not load past seasons.",
        );
        setStatus("error");
      });
    return () => controller.abort();
  }, [vineyard, vineyardStatus, vineyardError]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Past seasons"
        description={
          vineyard
            ? `${vineyard.name} — season history and frozen end-of-season summaries.`
            : "Season history and frozen end-of-season summaries."
        }
        actions={
          <Button asChild variant="outline">
            <Link to="/setup">Back to setup</Link>
          </Button>
        }
      />

      {status === "loading" ? (
        <div className="space-y-3" aria-busy="true">
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <p className="sr-only">Loading seasons</p>
        </div>
      ) : status === "error" ? (
        <EmptyState
          title="Could not load seasons"
          action={
            <Button type="button" onClick={() => void reloadVineyard()}>
              Try again
            </Button>
          }
        >
          {error ?? "Could not reach the API."}
        </EmptyState>
      ) : !vineyard ? (
        <EmptyState title="No vineyard yet">
          Seasons will appear once the vineyard is set up.
        </EmptyState>
      ) : seasons.length === 0 ? (
        <EmptyState title="No seasons yet">
          Seasons appear here once work is logged or a season is started.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {seasons.map((season) => (
            <li key={season.id}>
              <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-tight">
                        {season.year} season
                      </h2>
                      <Badge
                        variant={season.status === "active" ? "default" : "muted"}
                      >
                        {SEASON_STATUS_LABELS[season.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {[
                        seasonStartLine(season),
                        season.closedAt ? seasonClosedLine(season.closedAt) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button asChild variant={season.hasSummary ? "default" : "outline"}>
                      <Link to={`/seasons/${season.id}`}>
                        {season.hasSummary ? "View summary" : "View details"}
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
