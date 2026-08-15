import { Link } from "react-router-dom";
import { HealthLegend } from "@/components/HealthLegend";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useApiHealth } from "@/hooks/useApiHealth";

export function DashboardPage() {
  const api = useApiHealth();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Vineyard health"
        description="Open the map, see which rows need attention, then drill into a block, row, or vine."
        actions={
          <Button asChild>
            <Link to="/setup">Set up vineyard</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Map overlay</CardTitle>
          <CardDescription>
            Rows will render here with green, yellow, orange, and red overlays
            once vineyard setup and health scores are wired.
          </CardDescription>
          <div className="mt-6 flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 text-center text-muted">
            No rows yet. Add varieties and rows in Setup to see L1 / S1 on the
            map.
          </div>
        </Card>

        <Card>
          <CardTitle>API</CardTitle>
          <CardDescription>
            {api === "loading" && "Checking /api/v1/health…"}
            {api === "offline" &&
              "API is offline. Start it with pnpm dev from the repo root."}
            {api !== "loading" && api !== "offline" && (
              <>
                <Badge variant="green">{api.status}</Badge>
                <span className="mt-2 block text-sm">
                  {api.service} · {new Date(api.timestamp).toLocaleString()}
                </span>
              </>
            )}
          </CardDescription>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Health colors</h2>
        <HealthLegend />
      </section>
    </div>
  );
}
