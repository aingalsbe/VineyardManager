import { Link } from "react-router-dom";
import { formatRowLength } from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useVineyardRows } from "@/hooks/useVineyardRows";
import { summarizeRows } from "@/lib/summarize-rows";

const steps = [
  {
    title: "Varieties",
    body: "Add the grapes you grow. Lookup can fill water needs and prune windows later.",
  },
  {
    title: "Map rows",
    body: "Create rows (L1, S1, …) with variety, length in feet and inches, and vine count.",
  },
  {
    title: "Calendar",
    body: "Set the vineyard address so a typical Jan–Dec schedule can be seeded and then edited.",
  },
  {
    title: "Health colors",
    body: "Keep the default green / yellow / orange / red cutoffs or tighten how soon a missed task turns orange.",
  },
];

export function SetupPage() {
  const { state, reload } = useVineyardRows();
  const stats =
    state.status === "ready" ? summarizeRows(state.rows) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Setup"
        description="Do this once: varieties, rows, calendar, and health thresholds. Then the dashboard has something to color."
      />

      {state.status === "loading" ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3" aria-busy="true">
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <p className="sr-only">Loading vineyard stats</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="mb-6">
          <EmptyState
            title="Could not load vineyard stats"
            action={
              <Button type="button" onClick={() => void reload()}>
                Try again
              </Button>
            }
          >
            {state.message}
          </EmptyState>
        </div>
      ) : null}

      {state.status === "empty-vineyard" ? (
        <div className="mb-6">
          <EmptyState
            title="No vineyard yet"
            action={
              <Button asChild>
                <Link to="/rows">Go to rows</Link>
              </Button>
            }
          >
            Add rows after the vineyard exists. Inventory numbers will show
            here.
          </EmptyState>
        </div>
      ) : null}

      {stats ? (
        <section className="mb-6 grid gap-4 sm:grid-cols-3">
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
      ) : null}

      <ol className="grid gap-4 md:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Card>
              <p className="text-sm font-medium text-primary">
                Step {index + 1}
              </p>
              <CardTitle className="mt-1">{step.title}</CardTitle>
              <CardDescription>{step.body}</CardDescription>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
