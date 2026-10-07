import { formatYield, type Harvest } from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  rowFullLabel,
  rowLabel,
  type RowVarietyLookup,
} from "@/lib/rowLabel";

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
  varietyLookup,
}: {
  harvest: Harvest;
  onEdit?: (harvest: Harvest) => void;
  varietyLookup?: RowVarietyLookup;
}) {
  const rowText = harvest.row ? rowLabel(harvest.row, varietyLookup) : "Row";
  const rowTitle = harvest.row
    ? rowFullLabel(harvest.row, varietyLookup)
    : undefined;

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary" title={rowTitle}>
            {rowText}
          </p>
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
