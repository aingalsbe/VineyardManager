import { TASK_STATUSES, TASK_TYPES } from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const typeHelp: Record<(typeof TASK_TYPES)[number], string> = {
  maintenance: "Pruning, watering, fertilizer, pest and weed windows",
  weather: "Frost, hail, drought, and other alerts",
  health_summary: "Weekly vineyard health digest",
};

export function TasksPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Tasks"
        description="Upcoming scheduled work and notifications. Status moves from pending to sent, then acknowledged or dismissed."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {TASK_TYPES.map((type) => (
          <Card key={type}>
            <CardTitle className="capitalize">
              {type.replace("_", " ")}
            </CardTitle>
            <CardDescription>{typeHelp[type]}</CardDescription>
          </Card>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {TASK_STATUSES.map((status) => (
          <Badge key={status} variant="muted">
            {status}
          </Badge>
        ))}
      </div>

      <EmptyState title="No scheduled tasks">
        Seed the annual calendar from the vineyard address after setup. Until
        then, this page stays empty rather than showing sample work.
      </EmptyState>
    </div>
  );
}
