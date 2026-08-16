import { ACTIVITY_SCOPES, ACTIVITY_TYPES } from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const labels: Record<(typeof ACTIVITY_TYPES)[number], string> = {
  pruning: "Pruning",
  watering: "Watering",
  fertilization: "Fertilization",
  pest_prevention: "Pest prevention",
  weed_prevention: "Weed prevention",
  harvest: "Harvest",
  health_observation: "Health observation",
  vine_replacement: "Vine replacement",
  winterization: "Winterization",
  other: "Other",
};

export function ActivitiesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Log work"
        description="Apply an activity to the whole vineyard, a variety, a row, or a single vine. Date defaults to today."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {ACTIVITY_SCOPES.map((scope) => (
          <Badge key={scope} variant="muted">
            {scope}
          </Badge>
        ))}
      </div>

      <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ACTIVITY_TYPES.map((type) => (
          <Button key={type} type="button" variant="outline" disabled>
            {labels[type]}
          </Button>
        ))}
      </div>

      <EmptyState title="Logging is not connected yet">
        The write path is{" "}
        <code className="text-foreground">POST /api/v1/vineyards/:id/activities</code>{" "}
        with a scope and a typed details payload. Buttons stay disabled until
        that endpoint persists.
      </EmptyState>
    </div>
  );
}
