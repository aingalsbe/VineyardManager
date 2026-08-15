import { Link } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

export function BlocksPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Blocks"
        description="Blocks (parcels) group rows by hillside, irrigation zone, or any name you use in the field."
      />
      <EmptyState
        title="No blocks yet"
        action={
          <Button asChild variant="outline">
            <Link to="/setup">Go to setup</Link>
          </Button>
        }
      >
        When persistence is connected, this list will come from{" "}
        <code className="text-foreground">GET /api/v1/vineyards/:id/blocks</code>
        . Tasks can be vineyard-wide or scoped to a block.
      </EmptyState>
    </div>
  );
}
