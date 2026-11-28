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
  onDelete,
  onRestore,
  varietyLookup,
}: {
  harvest: Harvest;
  onEdit?: (harvest: Harvest) => void;
  onDelete?: (harvest: Harvest) => void;
  onRestore?: (harvest: Harvest) => void;
  varietyLookup?: RowVarietyLookup;
}) {
  const rowText = harvest.row ? rowLabel(harvest.row, varietyLookup) : "Row";
  const rowTitle = harvest.row
    ? rowFullLabel(harvest.row, varietyLookup)
    : undefined;
  const isClosedSeason = harvest.seasonStatus === "closed";
  const isDeleted = Boolean(harvest.deletedAt);

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
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
          {isDeleted && harvest.deletedAt ? (
            <p className="mt-1 text-xs text-muted">
              Removed {formatDate(harvest.deletedAt)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isClosedSeason ? <Badge variant="muted">Closed season</Badge> : null}
          <Badge variant="muted">{harvest.yieldUnit}</Badge>
          {isDeleted ? (
            !isClosedSeason && onRestore ? (
              <Button
                type="button"
                variant="outline"
                size="smTouch"
                onClick={() => onRestore(harvest)}
              >
                Restore
              </Button>
            ) : null
          ) : !isClosedSeason ? (
            <>
              {onEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="smTouch"
                  onClick={() => onEdit(harvest)}
                >
                  Edit
                </Button>
              ) : null}
              {onDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  size="smTouch"
                  onClick={() => onDelete(harvest)}
                >
                  Delete
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
