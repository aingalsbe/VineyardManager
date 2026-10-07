import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Clock,
  Grape,
  Map as MapIcon,
  Rows3,
  Zap,
} from "lucide-react";
import {
  formatYield,
  type ActivityType,
  type Harvest,
  type RowHealth,
  type ScheduledTask,
} from "@vineyard/shared";
import { ActivityFormDialog } from "@/components/activities/ActivityFormDialog";
import { EmptyState } from "@/components/EmptyState";
import { HealthLegend } from "@/components/HealthLegend";
import { RowActionPanel } from "@/components/health/RowActionPanel";
import { VineyardHealthMap } from "@/components/health/VineyardHealthMap";
import { VineyardMapDialog } from "@/components/health/VineyardMapDialog";
import { WeatherHealthControl } from "@/components/weather/WeatherHealthControl";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useApiHealth } from "@/hooks/useApiHealth";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useHarvests } from "@/hooks/useHarvests";
import { useVineyardHealth } from "@/hooks/useVineyardHealth";
import { useVineyardWeather } from "@/hooks/useVineyardWeather";
import { useVineyardRows } from "@/hooks/useVineyardRows";
import { useVineyardTasks } from "@/hooks/useVineyardTasks";
import { ApiError, updateTask } from "@/lib/api";
import { healthSwatch } from "@/lib/health";
import { cn } from "@/lib/utils";
import {
  buildVarietyLookup,
  rowFullLabel,
  rowLabel,
  rowSecondaryLabel,
  type RowVarietyLookup,
} from "@/lib/rowLabel";

const DUE_LIMIT = 4;
const RECENT_HARVEST_LIMIT = 4;
const ATTENTION_LIMIT = 4;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isOpenTask(task: ScheduledTask): boolean {
  return task.status !== "acknowledged" && task.status !== "dismissed";
}

type DueKind = "overdue" | "today" | "upcoming";

function dueKind(iso: string): DueKind {
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const due = new Date(iso);
  if (due < today) return "overdue";
  if (due < tomorrow) return "today";
  return "upcoming";
}


/** Card shell used by the decision strip. */
function DecisionCard({
  icon,
  title,
  action,
  tone = "default",
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  tone?: "default" | "primary";
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border p-4",
        tone === "primary"
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card",
      )}
    >
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h2
          className={cn(
            "flex items-center gap-2 text-sm font-medium",
            tone === "primary" ? "text-primary" : "text-muted",
          )}
        >
          {icon}
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-1 min-w-0 flex-1">{children}</div>
    </section>
  );
}

function InlineError({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div className="space-y-2" role="alert">
      <p className="text-sm text-muted">{message}</p>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}

function SkeletonLines({ label, lines = 2 }: { label: string; lines?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="h-4 animate-pulse rounded bg-background"
          style={{ width: `${90 - index * 20}%` }}
        />
      ))}
      <p className="sr-only">{label}</p>
    </div>
  );
}

/** Clickable row reference that opens the map pop-up with the row highlighted. */
function RowLink({
  label,
  onSelect,
  className,
  title,
  children,
}: {
  label: string;
  title?: string;
  onSelect: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Show ${label} on the map`}
      title={title}
      className={cn(
        "inline-flex min-h-11 items-center gap-1 rounded-md text-left font-medium text-primary underline-offset-2 hover:underline",
        focusRing,
        className,
      )}
    >
      {children ?? label}
    </button>
  );
}

export function DashboardPage() {
  const { canOperate } = useRoleAccess();
  const api = useApiHealth();
  const rows = useVineyardRows();
  const tasks = useVineyardTasks();
  const harvests = useHarvests();
  const health = useVineyardHealth();
  const weather = useVineyardWeather();

  const rowsLoading = rows.state.status === "loading";
  const emptyVineyard =
    rows.state.status === "empty-vineyard" ||
    tasks.state.status === "empty-vineyard" ||
    harvests.state.status === "empty-vineyard";
  const rowsError = rows.state.status === "error" ? rows.state.message : null;

  const vineyardName =
    rows.state.status === "ready"
      ? rows.state.vineyard.name
      : tasks.state.status === "ready"
        ? tasks.state.vineyard.name
        : null;

  const readyRows = rows.state.status === "ready" ? rows.state.rows : [];
  const readyTasks = tasks.state.status === "ready" ? tasks.state.tasks : [];
  const readyHarvests =
    harvests.state.status === "ready" ? harvests.state.harvests : [];
  const healthReady = health.state.status === "ready" ? health.state.health : null;
  const healthError =
    health.state.status === "error" ? health.state.message : null;
  const tasksError = tasks.state.status === "error" ? tasks.state.message : null;
  const harvestsError =
    harvests.state.status === "error" ? harvests.state.message : null;

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);
  const weatherOverlayRef = useRef<HTMLDivElement>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [presetType, setPresetType] = useState<ActivityType | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const selectedRow = readyRows.find((row) => row.id === selectedRowId) ?? null;
  const selectedHealth =
    healthReady?.rows.find((row) => row.rowId === selectedRowId) ?? null;
  const highlightedHealth =
    healthReady?.rows.find((row) => row.rowId === highlightRowId) ?? null;
  const highlightedRow =
    readyRows.find((row) => row.id === highlightRowId) ?? null;
  const vineyardId =
    rows.state.status === "ready" ? rows.state.vineyard.id : null;
  const varieties = useMemo(() => buildVarietyLookup(readyRows), [readyRows]);
  const label = (row: Parameters<typeof rowLabel>[0]) => rowLabel(row, varieties);

  const dueTasks = useMemo(() => {
    return readyTasks
      .filter(isOpenTask)
      .slice()
      .sort(
        (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
      )
      .slice(0, DUE_LIMIT)
      .map((task) => ({ task, kind: dueKind(task.dueAt) }));
  }, [readyTasks]);
  const overdueCount = useMemo(
    () =>
      readyTasks.filter(
        (task) => isOpenTask(task) && dueKind(task.dueAt) === "overdue",
      ).length,
    [readyTasks],
  );

  const rowsByScore = useMemo(
    () => (healthReady ? healthReady.rows.slice().sort((a, b) => a.score - b.score) : []),
    [healthReady],
  );
  const attentionRows = rowsByScore
    .filter((row) => row.color === "red" || row.color === "orange")
    .slice(0, ATTENTION_LIMIT);
  const weatherAlerts =
    weather.state.status === "ready" ? weather.state.weather.alerts : [];

  const recentHarvests = useMemo(
    () => readyHarvests.slice(0, RECENT_HARVEST_LIMIT),
    [readyHarvests],
  );

  const retry = () => {
    void rows.reload();
    void tasks.reload();
    void harvests.reload();
    void health.reload();
  };

  const openMap = (rowId: string | null = null) => {
    setHighlightRowId(rowId);
    setMapOpen(true);
  };

  const apiBadge =
    api === "offline" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-card px-2.5 py-1 text-xs font-medium text-foreground">
        <span className="size-2 rounded-full bg-muted" aria-hidden />
        API offline
      </span>
    ) : api !== "loading" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted">
        <span className="size-2 rounded-full bg-primary" aria-hidden />
        API {api.status}
      </span>
    ) : null;

  const dashboardActions = (
    <div className="flex flex-wrap items-center gap-2">
      {apiBadge}
      {canOperate ? (
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/setup">Set up vineyard</Link>
        </Button>
      ) : null}
    </div>
  );

  const header = (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="truncate text-muted">
          {vineyardName ?? "Morning decisions at a glance."}
        </p>
      </div>
      {dashboardActions}
    </div>
  );

  if (rowsLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4" aria-busy="true">
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="min-h-36 animate-pulse bg-card/70" />
          <Card className="min-h-36 animate-pulse bg-card/70" />
          <Card className="min-h-36 animate-pulse bg-card/70" />
        </div>
        <Card className="min-h-24 animate-pulse bg-card/70" />
        <p className="sr-only">Loading dashboard</p>
      </div>
    );
  }

  if (rowsError) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <EmptyState
          title="Could not load the dashboard"
          action={
            <Button type="button" onClick={retry}>
              Try again
            </Button>
          }
        >
          {rowsError}
        </EmptyState>
      </div>
    );
  }

  if (emptyVineyard) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <EmptyState
          title="No vineyard yet"
          action={
            canOperate ? (
              <Button asChild>
                <Link to="/setup">Set up vineyard</Link>
              </Button>
            ) : undefined
          }
        >
          Add the property in Setup, then rows, tasks, and harvests will show
          up here.
        </EmptyState>
      </div>
    );
  }

  const healthCard = (
    <DecisionCard
      icon={<Rows3 className="size-4 text-primary" aria-hidden />}
      title="Vineyard health"
      action={
        <div className="flex items-center gap-2">
          <WeatherHealthControl
            state={weather.state}
            onRetry={() => void weather.reload()}
            overlayContainerRef={weatherOverlayRef}
            showTemp
          />
          <Button
            type="button"
            variant="outline"
            className={cn("min-h-11 gap-2 border-primary/30 text-primary", focusRing)}
            disabled={!healthReady}
            aria-haspopup="dialog"
            aria-expanded={mapOpen}
            onClick={() => openMap(null)}
          >
            <MapIcon className="size-5" aria-hidden />
            <span>Map</span>
          </Button>
        </div>
      }
    >
      {healthReady ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`size-4 rounded-full ${healthSwatch[healthReady.overall.color]}`}
              aria-hidden
            />
            <p className="text-2xl font-semibold tracking-tight capitalize">
              {healthReady.overall.color} {healthReady.overall.score}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted">
            {healthReady.overall.reasons[0]?.message ?? "No issues scored."}
          </p>
        </>
      ) : healthError ? (
        <InlineError
          message={healthError}
          onRetry={() => void health.reload()}
          retryLabel="Try health again"
        />
      ) : (
        <SkeletonLines label="Loading vineyard health" />
      )}
    </DecisionCard>
  );

  const alertCount = weatherAlerts.length + attentionRows.length;
  const alertsCard = (
    <DecisionCard
      tone={alertCount > 0 ? "primary" : "default"}
      icon={<AlertTriangle className="size-4" aria-hidden />}
      title="Alerts needing attention"
    >
      <p className="text-lg font-semibold text-foreground">
        {weather.state.status === "ready"
          ? `${weatherAlerts.length} weather`
          : "Weather —"}{" "}
        ·{" "}
        {healthReady ? `${attentionRows.length} health` : "Health —"}
      </p>
      <ul className="mt-1 space-y-0.5 text-sm text-muted">
        {weatherAlerts.slice(0, 2).map((alert) => (
          <li key={alert.id} className="flex min-h-8 items-center">
            {alert.title}
          </li>
        ))}
        {weather.state.status === "loading" ? (
          <li className="min-h-8">Checking weather alerts…</li>
        ) : null}
        {weather.state.status === "error" ||
        weather.state.status === "weather-unavailable" ||
        weather.state.status === "location-unresolved" ? (
          <li className="min-h-8">{weather.state.message}</li>
        ) : null}
        {attentionRows.map((row) => (
          <li key={row.rowId}>
            <RowLink
              label={label(row)}
              title={rowFullLabel(row, varieties)}
              onSelect={() => openMap(row.rowId)}
              className="text-sm"
            >
              {label(row)}{" "}
              <span className="font-normal text-muted">
                score {row.score} ({row.color})
              </span>
            </RowLink>
          </li>
        ))}
        {healthError ? <li className="min-h-8">Health alerts unavailable.</li> : null}
        {alertCount === 0 &&
        weather.state.status === "ready" &&
        healthReady ? (
          <li className="min-h-8">Nothing urgent this morning.</li>
        ) : null}
      </ul>
    </DecisionCard>
  );

  const tasksCard = (
    <DecisionCard
      icon={<Clock className="size-4 text-primary" aria-hidden />}
      title={overdueCount > 0 ? `Due / overdue (${overdueCount} overdue)` : "Due / overdue"}
      action={
        <Button asChild variant="link" size="sm" className="min-h-11">
          <Link to="/tasks">All tasks</Link>
        </Button>
      }
    >
      {tasks.state.status === "loading" ? (
        <SkeletonLines label="Loading tasks" lines={3} />
      ) : tasksError ? (
        <InlineError
          message={tasksError}
          onRetry={() => void tasks.reload()}
          retryLabel="Try tasks again"
        />
      ) : dueTasks.length === 0 ? (
        <p className="text-sm text-muted">No open tasks. Nothing pending.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {dueTasks.map(({ task, kind }) => (
            <DueTaskItem
              key={task.id}
              task={task}
              kind={kind}
              varieties={varieties}
              onSelectRow={
                task.rowId ? () => openMap(task.rowId ?? null) : undefined
              }
            />
          ))}
        </ul>
      )}
    </DecisionCard>
  );

  return (
    <div className="mx-auto w-full max-w-6xl pb-6">
      {header}

      {/* Weather pop-down portals into this container (covers the decision area). */}
      <div className="relative" ref={weatherOverlayRef}>
        <section
          className="grid gap-3 lg:grid-cols-3"
          aria-label="Morning decisions"
        >
          {healthCard}
          {alertsCard}
          {tasksCard}
        </section>

        {healthReady ? (
          <section
            className="mt-3 rounded-xl border border-border bg-card p-4"
            aria-labelledby="row-drill-title"
          >
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2
                  id="row-drill-title"
                  className="flex items-center gap-2 text-lg font-semibold"
                >
                  <MapIcon className="size-5 text-primary" aria-hidden />
                  Row drill-in
                </h2>
                <p className="text-sm text-muted">
                  Lowest scores first. Select a row to see it on the map.
                </p>
              </div>
              <HealthLegend compact />
            </div>
            {rowsByScore.length === 0 ? (
              <p className="text-sm text-muted">
                No rows yet.{" "}
                <Link to="/rows" className="font-medium text-primary underline">
                  Add rows
                </Link>
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {rowsByScore.map((row) => (
                  <li key={row.rowId}>
                    <RowChip
                      row={row}
                      varieties={varieties}
                      onSelect={() => openMap(row.rowId)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="quick-actions-title">
          <h2
            id="quick-actions-title"
            className="mb-3 flex items-center gap-2 text-lg font-semibold"
          >
            <Zap className="size-5 text-primary" aria-hidden />
            Quick actions
          </h2>
          <Card>
            <div className="flex flex-wrap gap-2">
              {canOperate ? (
                <>
                  <Button asChild className="min-h-11">
                    <Link to="/harvests">Record harvest</Link>
                  </Button>
                  <Button asChild className="min-h-11">
                    <Link to="/tasks">Add task</Link>
                  </Button>
                </>
              ) : null}
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/rows">View rows</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/tasks">View tasks</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/harvests">View harvests</Link>
              </Button>
            </div>
          </Card>
        </section>

        <section aria-labelledby="recent-harvests-title">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2
              id="recent-harvests-title"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <Grape className="size-5 text-primary" aria-hidden />
              Recent harvests
            </h2>
            <Button asChild variant="link" size="sm" className="min-h-11">
              <Link to="/harvests">All harvests</Link>
            </Button>
          </div>
          {harvests.state.status === "loading" ? (
            <Card>
              <SkeletonLines label="Loading harvests" />
            </Card>
          ) : harvestsError ? (
            <Card>
              <InlineError
                message={harvestsError}
                onRetry={() => void harvests.reload()}
                retryLabel="Try harvests again"
              />
            </Card>
          ) : recentHarvests.length === 0 ? (
            <Card>
              <CardTitle>No harvests yet</CardTitle>
              <CardDescription>
                Record a pick from a row card or the Harvests page.
              </CardDescription>
            </Card>
          ) : (
            <ul className="space-y-2">
              {recentHarvests.map((harvest) => (
                <li key={harvest.id}>
                  <RecentHarvestItem
                    harvest={harvest}
                    varieties={varieties}
                    onSelectRow={
                      harvest.row && healthReady
                        ? () => openMap(harvest.row?.id ?? null)
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {healthReady ? (
        <VineyardMapDialog
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          suspend={Boolean(selectedRow) || activityOpen}
          highlightRowId={highlightRowId}
          subtitle={
            highlightedHealth || highlightedRow ? (
              <span>
                Highlighted:{" "}
                <span className="font-medium text-foreground">
                  {label(
                    highlightedRow ??
                      highlightedHealth ?? { code: "", name: "" },
                  )}
                </span>
                {highlightedRow && rowSecondaryLabel(highlightedRow)
                  ? ` (${rowSecondaryLabel(highlightedRow)})`
                  : null}
                {highlightedHealth
                  ? ` · score ${highlightedHealth.score} · ${
                      highlightedHealth.reasons[0]?.message ?? "No issues scored"
                    }`
                  : null}
              </span>
            ) : (
              "Select a row to open its actions."
            )
          }
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <HealthLegend compact />
            {highlightRowId && highlightedRow ? (
              <Button
                type="button"
                className="min-h-11"
                onClick={() => {
                  setActionError(null);
                  setSelectedRowId(highlightRowId);
                }}
              >
                Open {label(highlightedRow)} actions
              </Button>
            ) : null}
          </div>
          <VineyardHealthMap
            overallColor={healthReady.overall.color}
            healthRows={healthReady.rows}
            vineyardRows={readyRows}
            rowLayout={
              rows.state.status === "ready" ? rows.state.vineyard.rowLayout : null
            }
            highlightRowId={highlightRowId}
            svgClassName="max-h-[min(640px,65dvh)]"
            onSelectRow={(rowId) => {
              setActionError(null);
              setHighlightRowId(rowId);
              setSelectedRowId(rowId);
            }}
          />
        </VineyardMapDialog>
      ) : null}

      {selectedRow && vineyardId ? (
        <RowActionPanel
          row={selectedRow}
          health={selectedHealth}
          tasks={readyTasks}
          canWrite={canOperate}
          busy={actionBusy}
          suspendEscape={activityOpen}
          error={actionError}
          onClose={() => setSelectedRowId(null)}
          onCompleteTask={(taskId) => {
            void (async () => {
              setActionBusy(true);
              setActionError(null);
              try {
                await updateTask(vineyardId, taskId, {
                  status: "acknowledged",
                });
                await Promise.all([
                  health.reload({ silent: true }),
                  tasks.reload({ silent: true }),
                ]);
              } catch (error) {
                setActionError(
                  error instanceof ApiError
                    ? error.message
                    : "Could not complete the task.",
                );
              } finally {
                setActionBusy(false);
              }
            })();
          }}
          onLogWork={(type) => {
            setPresetType(type);
            setActivityOpen(true);
          }}
        />
      ) : null}

      {vineyardId ? (
        <ActivityFormDialog
          vineyardId={vineyardId}
          rows={readyRows}
          presetType={presetType}
          presetRowId={selectedRowId ?? undefined}
          open={activityOpen}
          onClose={() => setActivityOpen(false)}
          onSaved={async () => {
            await Promise.all([
              health.reload({ silent: true }),
              tasks.reload({ silent: true }),
            ]);
          }}
        />
      ) : null}
    </div>
  );
}

function RowChip({
  row,
  varieties,
  onSelect,
}: {
  row: RowHealth;
  varieties: RowVarietyLookup;
  onSelect: () => void;
}) {
  const short = rowLabel(row, varieties);
  return (
    <button
      type="button"
      onClick={onSelect}
      title={rowFullLabel(row, varieties)}
      aria-label={`${short}, score ${row.score}, ${row.color}. Show on map`}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left hover:border-primary/50 hover:bg-primary/5",
        focusRing,
      )}
    >
      <span
        className={`size-3 shrink-0 rounded-full ${healthSwatch[row.color]}`}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">
          {short}
        </span>
        <span className="block text-xs text-muted">{row.score}</span>
      </span>
    </button>
  );
}

const DUE_STYLE: Record<DueKind, string> = {
  overdue: "bg-primary text-primary-foreground",
  today: "bg-primary/10 text-primary",
  upcoming: "text-muted",
};

function DueTaskItem({
  task,
  kind,
  varieties,
  onSelectRow,
}: {
  task: ScheduledTask;
  kind: DueKind;
  varieties: RowVarietyLookup;
  onSelectRow?: () => void;
}) {
  const label =
    kind === "overdue"
      ? "Overdue"
      : kind === "today"
        ? "Today"
        : new Date(task.dueAt).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="min-w-0">
        <Link
          to="/tasks"
          className={cn(
            "inline-flex min-h-11 items-center font-medium text-foreground hover:underline",
            focusRing,
          )}
        >
          {task.title}
        </Link>{" "}
        <span className="text-muted">·</span>{" "}
        {task.row && onSelectRow ? (
          <RowLink
            label={rowLabel(task.row, varieties)}
            title={rowFullLabel(task.row, varieties)}
            onSelect={onSelectRow}
          >
            {rowLabel(task.row, varieties)}
          </RowLink>
        ) : (
          <span className="text-muted">
            {task.row ? rowLabel(task.row, varieties) : "Whole vineyard"}
          </span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
          DUE_STYLE[kind],
        )}
        title={`Due ${formatDate(task.dueAt)}`}
      >
        {label}
      </span>
    </li>
  );
}

function RecentHarvestItem({
  harvest,
  varieties,
  onSelectRow,
}: {
  harvest: Harvest;
  varieties: RowVarietyLookup;
  onSelectRow?: () => void;
}) {
  const label = harvest.row ? rowLabel(harvest.row, varieties) : "Row";
  const title = harvest.row ? rowFullLabel(harvest.row, varieties) : undefined;
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2">
      <div className="min-w-0">
        {onSelectRow ? (
          <RowLink
            label={label}
            title={title}
            onSelect={onSelectRow}
            className="min-h-9 text-sm"
          >
            {label}
          </RowLink>
        ) : (
          <p className="text-sm font-medium text-primary" title={title}>
            {label}
          </p>
        )}
        <p className="font-semibold">
          {formatYield(harvest.yieldAmount, harvest.yieldUnit)}
        </p>
      </div>
      <p className="shrink-0 text-sm text-muted">
        {formatDate(harvest.harvestedAt)}
      </p>
    </div>
  );
}
