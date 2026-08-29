import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  formatYield,
  TASK_STATUS_LABELS,
  type ActivityType,
  type Harvest,
  type ScheduledTask,
} from "@vineyard/shared";
import { ActivityFormDialog } from "@/components/activities/ActivityFormDialog";
import { EmptyState } from "@/components/EmptyState";
import { HealthLegend } from "@/components/HealthLegend";
import { RowActionPanel } from "@/components/health/RowActionPanel";
import { VineyardHealthMap } from "@/components/health/VineyardHealthMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useApiHealth } from "@/hooks/useApiHealth";
import { useHarvests } from "@/hooks/useHarvests";
import { useVineyardHealth } from "@/hooks/useVineyardHealth";
import { useVineyardRows } from "@/hooks/useVineyardRows";
import { useVineyardTasks } from "@/hooks/useVineyardTasks";
import { ApiError, updateTask } from "@/lib/api";
import { healthSwatch } from "@/lib/health";

const UPCOMING_LIMIT = 5;
const RECENT_HARVEST_LIMIT = 5;

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

export function DashboardPage() {
  const api = useApiHealth();
  const rows = useVineyardRows();
  const tasks = useVineyardTasks();
  const harvests = useHarvests();
  const health = useVineyardHealth();

  const coreLoading =
    rows.state.status === "loading" ||
    tasks.state.status === "loading" ||
    harvests.state.status === "loading";
  const emptyVineyard =
    rows.state.status === "empty-vineyard" ||
    tasks.state.status === "empty-vineyard" ||
    harvests.state.status === "empty-vineyard";
  const errorMessage = [
    rows.state.status === "error" ? rows.state.message : null,
    tasks.state.status === "error" ? tasks.state.message : null,
    harvests.state.status === "error" ? harvests.state.message : null,
  ].find((message) => message !== null);
  const loading =
    coreLoading ||
    (health.state.status === "loading" && !errorMessage && !emptyVineyard);

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
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [presetType, setPresetType] = useState<ActivityType | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const selectedRow = readyRows.find((row) => row.id === selectedRowId) ?? null;
  const selectedHealth =
    healthReady?.rows.find((row) => row.rowId === selectedRowId) ?? null;
  const vineyardId =
    rows.state.status === "ready" ? rows.state.vineyard.id : null;

  const upcoming = useMemo(() => {
    const today = startOfToday();
    return readyTasks
      .filter(isOpenTask)
      .slice()
      .sort(
        (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
      )
      .slice(0, UPCOMING_LIMIT)
      .map((task) => ({
        task,
        overdue: new Date(task.dueAt) < today,
      }));
  }, [readyTasks]);

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

  const dashboardActions = (
    <div className="flex flex-wrap gap-2">
      {api === "offline" ? <Badge variant="red">API offline</Badge> : null}
      {api !== "loading" && api !== "offline" ? (
        <Badge variant="green">API {api.status}</Badge>
      ) : null}
      <Button asChild variant="outline">
        <Link to="/setup">Set up vineyard</Link>
      </Button>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col md:min-h-0 md:flex-1">
      {loading ? (
        <div className="space-y-4" aria-busy="true">
          <Card className="min-h-40 animate-pulse bg-card/70" />
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <p className="sr-only">Loading dashboard</p>
        </div>
      ) : null}

      {errorMessage ? (
        <EmptyState
          title="Could not load the dashboard"
          action={
            <Button type="button" onClick={retry}>
              Try again
            </Button>
          }
        >
          {errorMessage}
        </EmptyState>
      ) : null}

      {emptyVineyard && !loading && !errorMessage ? (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            {dashboardActions}
          </div>
          <EmptyState
            title="No vineyard yet"
            action={
              <Button asChild>
                <Link to="/setup">Set up vineyard</Link>
              </Button>
            }
          >
            Add the property in Setup, then rows, tasks, and harvests will show
            up here.
          </EmptyState>
        </>
      ) : null}

      {!loading && !errorMessage && !emptyVineyard ? (
        <>
          <section className="shrink-0">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Dashboard
                </h1>
                <p className="text-muted">
                  {vineyardName ?? "Rows, upcoming work, and recent picks."}
                </p>
              </div>
              {dashboardActions}
            </div>
            {healthError ? (
              <EmptyState
                title="Could not load vineyard health"
                action={
                  <Button type="button" onClick={() => void health.reload()}>
                    Try health again
                  </Button>
                }
              >
                {healthError}
              </EmptyState>
            ) : null}
            {healthReady ? (
              <>
                <div className="mb-3 flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted">
                      Vineyard health
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <span
                        className={`size-4 rounded-full ${healthSwatch[healthReady.overall.color]}`}
                        aria-hidden
                      />
                      <p className="text-2xl font-semibold tracking-tight capitalize">
                        {healthReady.overall.color} {healthReady.overall.score}
                      </p>
                    </div>
                    {healthReady.overall.reasons[0] ? (
                      <p className="mt-1 text-sm text-muted">
                        {healthReady.overall.reasons[0].message}
                      </p>
                    ) : null}
                  </div>
                  <HealthLegend compact />
                </div>
                <VineyardHealthMap
                  overallColor={healthReady.overall.color}
                  healthRows={healthReady.rows}
                  vineyardRows={readyRows}
                  rowLayout={
                    rows.state.status === "ready"
                      ? rows.state.vineyard.rowLayout
                      : null
                  }
                  onSelectRow={(rowId) => {
                    setActionError(null);
                    setSelectedRowId(rowId);
                  }}
                />
              </>
            ) : null}
          </section>

          <div className="mt-4 min-h-0 space-y-6 pb-2 md:flex-1 md:overflow-y-auto">
            {healthReady ? (
              <ul className="space-y-2">
                {healthReady.rows.map((row) => (
                  <li
                    key={row.rowId}
                    className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <span
                      className={`mt-1 size-3.5 shrink-0 rounded-full ${healthSwatch[row.color]}`}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="font-medium">
                        {row.code} · {row.name}{" "}
                        <span className="font-normal text-muted">
                          {row.score}
                        </span>
                      </p>
                      <p className="text-sm text-muted">
                        {row.reasons[0]?.message ?? "No issues scored"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <section>
              <Card>
                <CardTitle>Quick actions</CardTitle>
                <CardDescription>
                  Jump into the work you do most often.
                </CardDescription>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild>
                    <Link to="/harvests">Record harvest</Link>
                  </Button>
                  <Button asChild>
                    <Link to="/tasks">Add task</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/rows">View rows</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/tasks">View tasks</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/harvests">View harvests</Link>
                  </Button>
                </div>
              </Card>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Upcoming tasks</h2>
                <Button asChild variant="link" size="sm">
                  <Link to="/tasks">All tasks</Link>
                </Button>
              </div>
              {upcoming.length === 0 ? (
                <Card>
                  <CardTitle>No open tasks</CardTitle>
                  <CardDescription>
                    Nothing pending or in progress. Add work from the Tasks
                    page.
                  </CardDescription>
                </Card>
              ) : (
                <ul className="space-y-3">
                  {upcoming.map(({ task, overdue }) => (
                    <li key={task.id}>
                      <UpcomingTaskItem
                        task={task}
                        overdue={overdue}
                        onSelectRow={
                          task.rowId
                            ? () => {
                                setActionError(null);
                                setSelectedRowId(task.rowId ?? null);
                              }
                            : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Recent harvests</h2>
                <Button asChild variant="link" size="sm">
                  <Link to="/harvests">All harvests</Link>
                </Button>
              </div>
              {recentHarvests.length === 0 ? (
                <Card>
                  <CardTitle>No harvests yet</CardTitle>
                  <CardDescription>
                    Record a pick from a row card or the Harvests page.
                  </CardDescription>
                </Card>
              ) : (
                <ul className="space-y-3">
                  {recentHarvests.map((harvest) => (
                    <li key={harvest.id}>
                      <RecentHarvestItem harvest={harvest} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          </div>

          {selectedRow && vineyardId ? (
            <RowActionPanel
              row={selectedRow}
              health={selectedHealth}
              tasks={readyTasks}
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

        </>
      ) : null}
    </div>
  );
}

function UpcomingTaskItem({
  task,
  overdue,
  onSelectRow,
}: {
  task: ScheduledTask;
  overdue: boolean;
  onSelectRow?: () => void;
}) {
  const rowLabel = task.row
    ? `${task.row.code} · ${task.row.name}`
    : "Whole vineyard";

  return (
    <Card>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{rowLabel}</p>
          {onSelectRow ? (
            <button
              type="button"
              className="text-left"
              onClick={onSelectRow}
            >
              <CardTitle className="mt-0.5">{task.title}</CardTitle>
            </button>
          ) : (
            <CardTitle className="mt-0.5">{task.title}</CardTitle>
          )}
          <CardDescription>Due {formatDate(task.dueAt)}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {overdue ? <Badge variant="red">Overdue</Badge> : null}
          <Badge variant={overdue ? "orange" : "muted"}>
            {TASK_STATUS_LABELS[task.status]}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link to="/tasks">Open</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RecentHarvestItem({ harvest }: { harvest: Harvest }) {
  const rowLabel = harvest.row
    ? `${harvest.row.code} · ${harvest.row.name}`
    : "Row";

  return (
    <Card>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">{rowLabel}</p>
          <CardTitle className="mt-0.5">
            {formatYield(harvest.yieldAmount, harvest.yieldUnit)}
          </CardTitle>
        </div>
        <p className="text-sm text-muted">{formatDate(harvest.harvestedAt)}</p>
      </div>
    </Card>
  );
}
