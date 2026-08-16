import { Link } from "react-router-dom";
import { BlockCard } from "@/components/blocks/BlockCard";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useVineyardBlocks } from "@/hooks/useVineyardBlocks";

export function BlocksPage() {
  const { state, reload } = useVineyardBlocks();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Blocks"
        description={
          state.status === "ready"
            ? `${state.vineyard.name} — parcels grouped by hillside, irrigation zone, or the name you use in the field.`
            : "Blocks (parcels) group rows by hillside, irrigation zone, or any name you use in the field."
        }
      />

      {state.status === "loading" ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <Card className="min-h-40 animate-pulse bg-card/70" />
          <Card className="min-h-40 animate-pulse bg-card/70" />
          <Card className="min-h-40 animate-pulse bg-card/70" />
          <p className="sr-only">Loading blocks</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <EmptyState
          title="Could not load blocks"
          action={
            <Button type="button" onClick={() => void reload()}>
              Try again
            </Button>
          }
        >
          {state.message} Confirm the API is running on http://localhost:3001
          and that you have applied migrations and seed data.
        </EmptyState>
      ) : null}

      {state.status === "empty-vineyard" ? (
        <EmptyState
          title="No vineyard yet"
          action={
            <Button asChild variant="outline">
              <Link to="/setup">Go to setup</Link>
            </Button>
          }
        >
          Create a vineyard, then run{" "}
          <code className="text-foreground">pnpm db:seed</code> to load sample
          blocks.
        </EmptyState>
      ) : null}

      {state.status === "ready" && state.blocks.length === 0 ? (
        <EmptyState
          title="No blocks yet"
          action={
            <Button asChild variant="outline">
              <Link to="/setup">Go to setup</Link>
            </Button>
          }
        >
          {state.vineyard.name} has no parcels. Add blocks in setup, or re-run
          the seed.
        </EmptyState>
      ) : null}

      {state.status === "ready" && state.blocks.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {state.blocks.map((block) => (
            <li key={block.id}>
              <BlockCard block={block} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
