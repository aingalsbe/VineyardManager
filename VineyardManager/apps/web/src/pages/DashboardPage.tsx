import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  formatYield,
  TASK_STATUS_LABELS,
  type Harvest,
  type ScheduledTask,
} from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { HealthLegend } from "@/components/HealthLegend";
import { VineyardHealthMap } from "@/components/health/VineyardHealthMap";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useApiHealth } from "@/hooks/useApiHealth";
import { useHarvests } from "@/hooks/useHarvests";
import { useVineyardHealth } from "@/hooks/useVineyardHealth";
import { useVineyardRows } from "@/hooks/useVineyardRows";
import { useVineyardTasks } from "@/hooks/useVineyardTasks";
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

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Dashboard"
        description={
          vineyardName
            ? `${vineyardName} — rows, upcoming work, and recent picks.`
            : "A quick look at the vineyard: rows, tasks, and harvests."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {api === "offline" ? (
              <Badge variant="red">API offline</Badge>
            ) : null}
            {api !== "loading" && api !== "offline" ? (
              <Badge variant="green">API {api.status}</Badge>
            ) : null}
            <Button asChild variant="outline">
              <Link to="/setup">Set up vineyard</Link>
            </Button>
          </div>
        }
      />

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
      ) : null}

      {!loading && !errorMessage && !emptyVineyard ? (
        <>
          <section>
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
                <Card className="mb-4">
                  <p className="text-sm font-medium text-muted">Vineyard health</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span
                      className={`size-4 rounded-full ${healthSwatch[healthReady.overall.color]}`}
                      aria-hidden
                    />
                    <p className="text-3xl font-semibold tracking-tight capitalize">
                      {healthReady.overall.color} {healthReady.overall.score}
                    </p>
                  </div>
                  {healthReady.overall.reasons.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-muted">
                      {healthReady.overall.reasons.slice(0, 2).map((reason) => (
                        <li key={`${reason.code}-${reason.message}`}>
                          {reason.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
                <VineyardHealthMap
                  overallColor={healthReady.overall.color}
                  healthRows={healthReady.rows}
                  vineyardRows={readyRows}
                  rowLayout={
                    rows.state.status === "ready"
                      ? rows.state.vineyard.rowLayout
                      : null
                  }
                />
                <ul className="mt-4 space-y-2">
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
                <div className="mt-4">
                  <HealthLegend />
                </div>
              </>
            ) : null}
          </section>

          <section className="mt-6">
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

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
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
                      <UpcomingTaskItem task={task} overdue={overdue} />
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

        </>
      ) : null}
    </div>
  );
}

function UpcomingTaskItem({
  task,
  overdue,
}: {
  task: ScheduledTask;
  overdue: boolean;
}) {
  const rowLabel = task.row
    ? `${task.row.code} · ${task.row.name}`
    : "Whole vineyard";

  return (
    <Card>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{rowLabel}</p>
          <CardTitle className="mt-0.5">{task.title}</CardTitle>
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
