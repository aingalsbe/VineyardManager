import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  formatRowLength,
  formatYield,
  TASK_STATUS_LABELS,
  type Harvest,
  type Row,
  type ScheduledTask,
} from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { HealthLegend } from "@/components/HealthLegend";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useApiHealth } from "@/hooks/useApiHealth";
import { useHarvests } from "@/hooks/useHarvests";
import { useVineyardRows } from "@/hooks/useVineyardRows";
import { useVineyardTasks } from "@/hooks/useVineyardTasks";

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

function summarizeRows(rows: Row[]) {
  const active = rows.filter((row) => row.status === "active");
  const totalInches = rows.reduce(
    (sum, row) => sum + row.lengthFeet * 12 + row.lengthInches,
    0,
  );
  const lengthFeet = Math.floor(totalInches / 12);
  const lengthInches = totalInches % 12;
  const vines = rows.reduce((sum, row) => sum + row.vineCount, 0);
  return { total: rows.length, active: active.length, lengthFeet, lengthInches, vines };
}

export function DashboardPage() {
  const api = useApiHealth();
  const rows = useVineyardRows();
  const tasks = useVineyardTasks();
  const harvests = useHarvests();

  const loading =
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

  const stats = useMemo(() => summarizeRows(readyRows), [readyRows]);

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
        <div className="grid gap-4 sm:grid-cols-3" aria-busy="true">
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <Card className="min-h-24 animate-pulse bg-card/70" />
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
          <section className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Active rows"
              value={String(stats.active)}
              hint={
                stats.total === stats.active
                  ? `${stats.total} rows on the property`
                  : `${stats.total} rows total`
              }
            />
            <StatCard
              label="Total length"
              value={formatRowLength(stats.lengthFeet, stats.lengthInches)}
              hint={`Across ${stats.total} ${stats.total === 1 ? "row" : "rows"}`}
            />
            <StatCard
              label="Vines"
              value={String(stats.vines)}
              hint="Sum of vine counts on every row"
            />
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

          <section className="mt-8">
            <Card>
              <CardTitle>Map overlay</CardTitle>
              <CardDescription>
                Row health colors on a map come later. Until then, use Rows for
                the layout and the legend below for the color scale.
              </CardDescription>
              <div className="mt-4 flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 text-center text-muted">
                Map coming later — health scoring is not wired yet.
              </div>
            </Card>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Health colors</h2>
            <HealthLegend />
          </section>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </Card>
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
