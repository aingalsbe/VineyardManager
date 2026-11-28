import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { SEASON_STATUS_LABELS, type SeasonDto } from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import type { AppOutletContext } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ApiError, getSeasonDetail } from "@/lib/api";
import { formatPounds, formatShortDate, formatShortMonth } from "@/lib/format";
import { healthMeaning } from "@/lib/health";
import { seasonClosedLine } from "@/lib/seasonCopy";

export function SeasonDetailPage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const { vineyard, vineyardStatus, vineyardError } =
    useOutletContext<AppOutletContext>();
  const [season, setSeason] = useState<SeasonDto | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (vineyardStatus === "loading") {
      setStatus("loading");
      return;
    }
    if (!vineyard || !seasonId) {
      setSeason(null);
      setStatus(vineyardStatus === "error" ? "error" : "ready");
      setError(vineyardError ?? null);
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    getSeasonDetail(vineyard.id, seasonId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setSeason(data);
          setStatus("ready");
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof ApiError ? err.message : "Could not load season summary.",
        );
        setStatus("error");
      });
    return () => controller.abort();
  }, [vineyard, vineyardStatus, vineyardError, seasonId]);

  const summary = season?.summary ?? null;
  const priorCount = season?.summaryHistory?.length ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={season ? `${season.year} Season Summary` : "Season Summary"}
        description={
          season
            ? `${vineyard?.name ?? ""} · ${
                season.closedAt
                  ? seasonClosedLine(season.closedAt)
                  : SEASON_STATUS_LABELS[season.status]
              }`
            : "Frozen end-of-season summary."
        }
        actions={
          <Button asChild variant="outline">
            <Link to="/seasons">All seasons</Link>
          </Button>
        }
      />

      {status === "loading" ? (
        <div className="space-y-4" aria-busy="true">
          <Card className="min-h-28 animate-pulse bg-card/70" />
          <Card className="min-h-40 animate-pulse bg-card/70" />
          <p className="sr-only">Loading season summary</p>
        </div>
      ) : status === "error" ? (
        <EmptyState title="Could not load season summary">
          {error ?? "Try again from Past seasons."}
        </EmptyState>
      ) : !season ? (
        <EmptyState title="Season not found">
          Return to Past seasons to pick another year.
        </EmptyState>
      ) : !summary ? (
        <EmptyState title={`No summary for ${season.year} yet`}>
          {season.status === "active"
            ? "A frozen summary is created when a power user closes the season."
            : "This season has not been closed yet."}
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {season.status === "active" ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
              This season was reopened on {formatShortDate(season.reopenedAt)}.
              Showing the frozen summary from its most recent close (v
              {summary.closeVersion}). Closing again will generate an updated
              summary.
            </div>
          ) : priorCount > 0 ? (
            <p className="text-sm text-muted">
              Latest summary (close v{summary.closeVersion}; {priorCount} prior{" "}
              {priorCount === 1 ? "close" : "closes"} archived).
            </p>
          ) : null}

          <Card>
            <CardTitle>Health at close</CardTitle>
            <CardDescription>
              Frozen score recorded on {formatShortDate(summary.closedAt)}.
            </CardDescription>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Badge variant={summary.health.color} className="px-3 py-1 text-base capitalize">
                {summary.health.color} {summary.health.score}
              </Badge>
              <span className="text-sm text-muted">
                {healthMeaning[summary.health.color]}
              </span>
            </div>
            {summary.health.monthlyTrend &&
            summary.health.monthlyTrend.length > 0 ? (
              <div className="mt-4">
                <p className="text-sm font-medium text-foreground">
                  Month-by-month trend
                </p>
                <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                  {summary.health.monthlyTrend.map((pt) => (
                    <li
                      key={pt.month}
                      className="rounded-md border border-border bg-background/60 px-2.5 py-1"
                    >
                      <span className="font-medium">
                        {formatShortMonth(pt.month) || pt.month}
                      </span>
                      : <span className="capitalize">{pt.color}</span> {pt.score}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardTitle>What went well</CardTitle>
              {summary.positives.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  None highlighted this season.
                </p>
              ) : (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
                  {summary.positives.map((item, idx) => (
                    <li key={`${item.code}-${idx}`}>{item.text}</li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardTitle>What to watch next year</CardTitle>
              {summary.negatives.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  No issues flagged this season.
                </p>
              ) : (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
                  {summary.negatives.map((item, idx) => (
                    <li key={`${item.code}-${idx}`}>{item.text}</li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <CardTitle>Harvest</CardTitle>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {formatPounds(summary.harvests.totalLb)} total
            </p>
            {summary.harvests.previousSeasonYear !== null &&
            summary.harvests.previousTotalLb !== null ? (
              <p className="mt-1 text-sm text-muted">
                Previous season ({summary.harvests.previousSeasonYear}):{" "}
                {formatPounds(summary.harvests.previousTotalLb)}
                {summary.harvests.deltaPct !== null
                  ? ` (${summary.harvests.deltaPct > 0 ? "+" : ""}${summary.harvests.deltaPct}%)`
                  : ""}
              </p>
            ) : null}
            {summary.harvests.skippedNonLb > 0 ? (
              <p className="mt-1 text-xs text-muted">
                {summary.harvests.skippedNonLb} non-pound{" "}
                {summary.harvests.skippedNonLb === 1 ? "pick" : "picks"} not
                converted.
              </p>
            ) : null}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  By variety
                </h3>
                {summary.harvests.byVariety.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    No harvests recorded this season.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-border text-sm">
                    {summary.harvests.byVariety.map((v) => (
                      <li
                        key={v.variety}
                        className="flex items-center justify-between gap-2 py-1.5"
                      >
                        <span className="font-medium">{v.variety}</span>
                        <span>
                          {formatPounds(v.totalLb)}
                          {v.previousTotalLb !== null
                            ? ` (prev ${formatPounds(v.previousTotalLb)})`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground">By row</h3>
                {summary.harvests.byRow.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    No harvests recorded this season.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-border text-sm">
                    {summary.harvests.byRow.map((r) => (
                      <li
                        key={r.rowId}
                        className="flex items-center justify-between gap-2 py-1.5"
                      >
                        <span className="font-medium">
                          {r.code} · {r.variety}
                        </span>
                        <span>
                          {formatPounds(r.totalLb)}
                          {r.previousTotalLb !== null
                            ? ` (prev ${formatPounds(r.previousTotalLb)})`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardTitle>Work logged</CardTitle>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted">Waterings</dt>
                  <dd className="text-lg font-semibold">
                    {summary.work.waterings}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Fertilizing</dt>
                  <dd className="text-lg font-semibold">
                    {summary.work.fertilizing}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Pest treatments</dt>
                  <dd className="text-lg font-semibold">
                    {summary.work.pestTreatments}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Weed treatments</dt>
                  <dd className="text-lg font-semibold">
                    {summary.work.weedTreatments}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card>
              <CardTitle>Notable weather</CardTitle>
              <p className="mt-3 text-sm text-foreground">
                {summary.weather.note}
              </p>
              {summary.weather.available ? (
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-muted">Frost days</dt>
                    <dd className="text-lg font-semibold">
                      {summary.weather.frostDays}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Heavy rain</dt>
                    <dd className="text-lg font-semibold">
                      {summary.weather.heavyRainDays}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Dry spells</dt>
                    <dd className="text-lg font-semibold">
                      {summary.weather.drySpells}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </Card>
          </div>

          <Card>
            <CardTitle>Tasks</CardTitle>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">Done on time</dt>
                <dd className="text-lg font-semibold">
                  {summary.tasks.doneOnTime}
                  {summary.tasks.onTimePct !== null ? (
                    <span className="ml-1 text-xs font-normal text-muted">
                      ({summary.tasks.onTimePct}%)
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Done late</dt>
                <dd className="text-lg font-semibold">
                  {summary.tasks.doneLate}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Dismissed earlier</dt>
                <dd className="text-lg font-semibold">
                  {summary.tasks.dismissedBeforeClose}
                </dd>
              </div>
              {summary.tasks.dismissedByEarlierClose ? (
                <div>
                  <dt className="text-muted">Dismissed by an earlier close</dt>
                  <dd className="text-lg font-semibold">
                    {summary.tasks.dismissedByEarlierClose}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted">Dismissed at close</dt>
                <dd className="text-lg font-semibold">
                  {summary.tasks.dismissedByClose}
                </dd>
              </div>
            </dl>
            {summary.tasks.dismissedByEarlierClose ? (
              <p className="mt-3 text-sm text-muted">
                This season was reopened. Tasks an earlier close dismissed stay
                dismissed, so they no longer count as overdue in this summary.
              </p>
            ) : null}
            {summary.tasks.dismissedByCloseList.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Open tasks dismissed when closing
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {summary.tasks.dismissedByCloseList.map((task) => (
                    <li key={task.id}>
                      {task.title} · Due {formatShortDate(task.dueDate)}
                      {task.rowCode ? ` · ${task.rowCode}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}
