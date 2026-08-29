import { formatYield, type Harvest } from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function HarvestCard({
  harvest,
  onEdit,
}: {
  harvest: Harvest;
  onEdit?: (harvest: Harvest) => void;
}) {
  const rowLabel = harvest.row
    ? `${harvest.row.code} · ${harvest.row.name}`
    : "Row";

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">{rowLabel}</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            {formatYield(harvest.yieldAmount, harvest.yieldUnit)}
          </h2>
          <p className="mt-1 text-muted">{formatDate(harvest.harvestedAt)}</p>
          {harvest.crew ? (
            <p className="mt-1 text-sm text-muted">Crew: {harvest.crew}</p>
          ) : null}
          {harvest.notes ? (
            <p className="mt-2 text-muted">{harvest.notes}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted">{harvest.yieldUnit}</Badge>
          {onEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEdit(harvest)}
            >
              Edit
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
