import {
  formatRowLength,
  type HealthColor,
  type Row,
  type RowStatus,
} from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { healthSwatch } from "@/lib/health";
import { cn } from "@/lib/utils";

const statusVariant: Record<
  RowStatus,
  "green" | "yellow" | "orange" | "muted"
> = {
  active: "green",
  fallow: "yellow",
  replanting: "orange",
  retired: "muted",
};

export function RowCard({
  row,
  onEdit,
  onRecordHarvest,
  health,
  highlighted = false,
}: {
  row: Row;
  onEdit: (row: Row) => void;
  onRecordHarvest: (row: Row) => void;
  health?: { color: HealthColor; reason?: string } | null;
  highlighted?: boolean;
}) {
  return (
    <Card className={cn(highlighted && "ring-2 ring-primary")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">{row.code}</p>
          <CardTitle className="mt-0.5">{row.name}</CardTitle>
          <CardDescription>{row.variety}</CardDescription>
          {health ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-muted">
              <span
                className={`mt-1 size-2.5 shrink-0 rounded-full ${healthSwatch[health.color]}`}
                aria-hidden
              />
              <span>
                <span className="font-medium capitalize text-foreground">
                  {health.color}
                </span>
                {health.reason ? ` — ${health.reason}` : ""}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant[row.status]} className="capitalize">
            {row.status}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onEdit(row)}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRecordHarvest(row)}
          >
            Record harvest
          </Button>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-muted">Length</dt>
          <dd className="font-medium">
            {formatRowLength(row.lengthFeet, row.lengthInches)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Vines</dt>
          <dd className="font-medium">{row.vineCount}</dd>
        </div>
        <div>
          <dt className="text-muted">Planted</dt>
          <dd className="font-medium">{row.plantedYear}</dd>
        </div>
      </dl>
      {row.notes ? (
        <p className="mt-4 text-sm text-muted">{row.notes}</p>
      ) : null}
    </Card>
  );
}
