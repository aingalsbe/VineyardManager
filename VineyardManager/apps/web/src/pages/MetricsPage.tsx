import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ACTIVITY_TYPE_LABELS,
  METRICS_PERIOD_LABELS,
  METRICS_PERIODS,
  METRICS_SCOPE_LABELS,
  METRICS_SCOPES,
  formatYield,
  type ActivityType,
  type MetricsPeriod,
  type MetricsScope,
  type VineyardMetrics,
} from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useVineyardMetrics } from "@/hooks/useVineyardMetrics";
import { healthSwatch } from "@/lib/health";
import {
  ACTIVITY_CHART_COLORS,
  CHART_AXIS,
  CHART_GRID,
  CHART_PRIMARY,
  CHART_TICK,
  HEALTH_BAND,
  chartTooltipStyle,
} from "@/components/metrics/chartTheme";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00.000Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatDayTick(iso: string): string {
  const parts = iso.split("-");
  return `${parts[1]}/${parts[2]}`;
}

function harvestDelta(current: number, prior: number): string | null {
  if (prior <= 0 && current <= 0) return null;
  if (prior <= 0) return "No harvest in the same window last year";
  const pct = Math.round(((current - prior) / prior) * 100);
  if (pct === 0) return "Even with last year";
  return pct > 0 ? `Up ${pct}% vs last year` : `Down ${Math.abs(pct)}% vs last year`;
}

export function MetricsPage() {
  const [period, setPeriod] = useState<MetricsPeriod>("year");
  const [scope, setScope] = useState<MetricsScope>("vineyard");
  const [rowId, setRowId] = useState<string>("");
  const [variety, setVariety] = useState<string>("");
  const { state, reload } = useVineyardMetrics(period);

  const metrics = state.status === "ready" ? state.metrics : null;

  const selectedRowId = useMemo(() => {
    if (!metrics) return "";
    if (rowId && metrics.health.rows.some((row) => row.rowId === rowId)) {
      return rowId;
    }
    return metrics.health.rows[0]?.rowId ?? "";
  }, [metrics, rowId]);

  const selectedVariety = useMemo(() => {
    if (!metrics) return "";
    if (
      variety &&
      metrics.health.varieties.some((item) => item.variety === variety)
    ) {
      return variety;
    }
    return metrics.health.varieties[0]?.variety ?? "";
  }, [metrics, variety]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Metrics"
        description={
          metrics
            ? `Health, harvest, and work from ${formatRange(metrics.range.start, metrics.range.end)}.`
            : "Health, harvest, and work trends for the vineyard."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {METRICS_PERIODS.map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={period === item ? "default" : "outline"}
                onClick={() => setPeriod(item)}
              >
                {METRICS_PERIOD_LABELS[item]}
              </Button>
            ))}
          </div>
        }
      />

      {state.status === "loading" ? (
        <div className="space-y-4" aria-busy="true">
          <Card className="min-h-28 animate-pulse bg-card/70" />
          <Card className="min-h-64 animate-pulse bg-card/70" />
          <p className="sr-only">Loading metrics</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <EmptyState
          title="Could not load metrics"
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
            <Button asChild>
              <Link to="/setup">Set up vineyard</Link>
            </Button>
          }
        >
          Add the property in Setup, then harvests and work will show up here.
        </EmptyState>
      ) : null}

      {metrics ? (
        <MetricsBody
          metrics={metrics}
          scope={scope}
          onScope={setScope}
          selectedRowId={selectedRowId}
          selectedVariety={selectedVariety}
          onRowId={setRowId}
          onVariety={setVariety}
        />
      ) : null}
    </div>
  );
}

function MetricsBody({
  metrics,
  scope,
  onScope,
  selectedRowId,
  selectedVariety,
  onRowId,
  onVariety,
}: {
  metrics: VineyardMetrics;
  scope: MetricsScope;
  onScope: (scope: MetricsScope) => void;
  selectedRowId: string;
  selectedVariety: string;
  onRowId: (id: string) => void;
  onVariety: (name: string) => void;
}) {
  const row = metrics.health.rows.find((item) => item.rowId === selectedRowId);
  const variety = metrics.health.varieties.find(
    (item) => item.variety === selectedVariety,
  );
  const harvestRow = metrics.harvests.byRow.find(
    (item) => item.rowId === selectedRowId,
  );
  const harvestVariety = metrics.harvests.byVariety.find(
    (item) => item.variety === selectedVariety,
  );
  const activityRow = metrics.activities.byRow.find(
    (item) => item.rowId === selectedRowId,
  );
  const activityVariety = metrics.activities.byVariety.find(
    (item) => item.variety === selectedVariety,
  );

  const healthSeries =
    scope === "row"
      ? (row?.series ?? [])
      : scope === "variety"
        ? (variety?.series ?? [])
        : metrics.health.series;
  const healthNow =
    scope === "row"
      ? row
      : scope === "variety"
        ? variety
        : metrics.health.current;

  const harvestBars =
    scope === "row"
      ? (harvestRow?.byYear ?? [])
      : scope === "variety"
        ? (harvestVariety?.byYear ?? [])
        : metrics.harvests.years.map((item) => ({
            year: item.year,
            amount: item.total,
          }));

  const activityByType =
    scope === "row"
      ? (activityRow?.byType ?? [])
      : scope === "variety"
        ? (activityVariety?.byType ?? [])
        : metrics.activities.byType;

  const healthTitle =
    scope === "row"
      ? `${row?.code ?? "Row"} health`
      : scope === "variety"
        ? `${variety?.variety ?? "Variety"} health`
        : "Vineyard health";
  const harvestTitle =
    scope === "row"
      ? `${row?.code ?? "Row"} harvest`
      : scope === "variety"
        ? `${variety?.variety ?? "Variety"} harvest`
        : "Harvest year over year";
  const harvestNote =
    scope === "variety" && variety
      ? `Combined ${variety.rowCodes.join(", ")}`
      : scope === "row" && row
        ? row.variety
        : "Pounds picked, all years in the books";

  const workTotal = metrics.activities.byType.reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const delta = harvestDelta(
    metrics.harvests.currentTotal,
    metrics.harvests.priorTotal,
  );

  const activityPoints =
    scope === "row"
      ? (activityRow?.series ?? [])
      : scope === "variety"
        ? (activityVariety?.series ?? [])
        : metrics.activities.series;
  const activityTime = stackActivitySeries(activityPoints);

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm font-medium text-muted">Vineyard health now</p>
          <div className="mt-2 flex items-center gap-3">
            <span
              className={`size-4 rounded-full ${healthSwatch[metrics.health.current.color]}`}
              aria-hidden
            />
            <p className="text-3xl font-semibold tracking-tight capitalize">
              {metrics.health.current.color} {metrics.health.current.score}
            </p>
          </div>
        </Card>
        <Card>
          <p className="text-sm font-medium text-muted">Harvest this period</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {formatYield(metrics.harvests.currentTotal, "lb")}
          </p>
          <p className="mt-1 text-sm text-muted">
            {delta ??
              `${formatYield(metrics.harvests.priorTotal, "lb")} last year`}
          </p>
          {metrics.harvests.skippedNonLb > 0 ? (
            <p className="mt-1 text-sm text-muted">
              {metrics.harvests.skippedNonLb} pick
              {metrics.harvests.skippedNonLb === 1 ? "" : "s"} not in pounds
              omitted
            </p>
          ) : null}
        </Card>
        <Card>
          <p className="text-sm font-medium text-muted">Work logged</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {workTotal}
          </p>
          <p className="mt-1 text-sm text-muted">Activities in this period</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {METRICS_SCOPES.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={scope === item ? "default" : "outline"}
              onClick={() => onScope(item)}
            >
              {METRICS_SCOPE_LABELS[item]}
            </Button>
          ))}
        </div>
        {scope === "row" ? (
          <label className="flex items-center gap-2 text-sm font-medium">
            Row
            <select
              className="h-11 min-w-40 rounded-md border border-border bg-card px-3 text-base"
              value={selectedRowId}
              onChange={(event) => onRowId(event.target.value)}
            >
              {metrics.health.rows.map((item) => (
                <option key={item.rowId} value={item.rowId}>
                  {item.code} · {item.variety}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {scope === "variety" ? (
          <label className="flex items-center gap-2 text-sm font-medium">
            Variety
            <select
              className="h-11 min-w-40 rounded-md border border-border bg-card px-3 text-base"
              value={selectedVariety}
              onChange={(event) => onVariety(event.target.value)}
            >
              {metrics.health.varieties.map((item) => (
                <option key={item.variety} value={item.variety}>
                  {item.variety} ({item.rowCodes.join(", ")})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="space-y-6">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{healthTitle}</CardTitle>
              <CardDescription>
                Live score at each date in the period. Green / yellow / orange /
                red bands are the vineyard cutoffs.
              </CardDescription>
            </div>
            {healthNow ? (
              <Badge variant={healthNow.color}>
                {healthNow.color} {healthNow.score}
              </Badge>
            ) : null}
          </div>
          {healthSeries.length === 0 ? (
            <p className="text-muted">No health samples in this period.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={healthSeries.map((point) => ({
                    date: point.date,
                    score: point.score,
                  }))}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDayTick}
                    tick={{ fill: CHART_TICK, fontSize: 12 }}
                    stroke={CHART_GRID}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: CHART_TICK, fontSize: 12 }}
                    stroke={CHART_GRID}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelFormatter={(value) => String(value)}
                    formatter={(value) => [`${value}`, "Score"]}
                  />
                  <ReferenceLine
                    y={80}
                    stroke={HEALTH_BAND.green}
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    y={70}
                    stroke={HEALTH_BAND.yellow}
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    y={60}
                    stroke={HEALTH_BAND.orange}
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={CHART_PRIMARY}
                    strokeWidth={2.5}
                    dot={false}
                    name="Score"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>{harvestTitle}</CardTitle>
          <CardDescription>{harvestNote}</CardDescription>
          {harvestBars.every((item) => item.amount === 0) ? (
            <p className="mt-4 text-muted">No pound harvests recorded yet.</p>
          ) : (
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={harvestBars.map((item) => ({
                    year: String(item.year),
                    lb: item.amount,
                  }))}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: CHART_TICK, fontSize: 12 }}
                    stroke={CHART_GRID}
                  />
                  <YAxis
                    tick={{ fill: CHART_TICK, fontSize: 12 }}
                    stroke={CHART_GRID}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value) => [
                      formatYield(Number(value), "lb"),
                      "Yield",
                    ]}
                  />
                  <Bar
                    dataKey="lb"
                    fill={CHART_PRIMARY}
                    radius={[6, 6, 0, 0]}
                    name="Pounds"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle>Work by type</CardTitle>
            <CardDescription>
              Activities in {formatRange(metrics.range.start, metrics.range.end)}
              {scope === "variety" && variety
                ? ` · ${variety.rowCodes.join(", ")}`
                : ""}
              .
            </CardDescription>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activityByType
                    .filter((item) => item.count > 0)
                    .map((item) => ({
                      type: ACTIVITY_TYPE_LABELS[item.activityType],
                      count: item.count,
                      fill: ACTIVITY_CHART_COLORS[item.activityType],
                    }))}
                  layout="vertical"
                  margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
                >
                  <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fill: CHART_TICK, fontSize: 12 }}
                    stroke={CHART_GRID}
                  />
                  <YAxis
                    type="category"
                    dataKey="type"
                    width={120}
                    tick={{ fill: CHART_AXIS, fontSize: 12 }}
                    stroke={CHART_GRID}
                  />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} name="Count">
                    {activityByType
                      .filter((item) => item.count > 0)
                      .map((item) => (
                        <Cell
                          key={item.activityType}
                          fill={ACTIVITY_CHART_COLORS[item.activityType]}
                        />
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardTitle>Work over time</CardTitle>
            <CardDescription>
              {scope === "vineyard"
                ? "All logged work, including vineyard-wide watering."
                : "Row-scoped work only."}
            </CardDescription>
            {activityTime.length === 0 ? (
              <p className="mt-4 text-muted">No activities in this period.</p>
            ) : (
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={activityTime}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDayTick}
                      tick={{ fill: CHART_TICK, fontSize: 12 }}
                      stroke={CHART_GRID}
                      minTickGap={24}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: CHART_TICK, fontSize: 12 }}
                      stroke={CHART_GRID}
                    />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {activityTypesInData(activityTime).map((type) => (
                      <Bar
                        key={type}
                        dataKey={type}
                        stackId="work"
                        fill={ACTIVITY_CHART_COLORS[type]}
                        name={ACTIVITY_TYPE_LABELS[type]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function activityTypesInData(
  rows: Array<Record<string, string | number>>,
): ActivityType[] {
  const present = new Set<ActivityType>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== "date" && typeof row[key] === "number" && row[key] > 0) {
        present.add(key as ActivityType);
      }
    }
  }
  return [...present];
}

function stackActivitySeries(
  points: VineyardMetrics["activities"]["series"],
): Array<Record<string, string | number>> {
  const types = new Set(points.map((point) => point.activityType));
  const byDate = new Map<string, Record<string, string | number>>();
  for (const point of points) {
    const row = byDate.get(point.date) ?? { date: point.date };
    for (const type of types) {
      if (row[type] == null) row[type] = 0;
    }
    row[point.activityType] = Number(row[point.activityType] ?? 0) + point.count;
    byDate.set(point.date, row);
  }
  return [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}
