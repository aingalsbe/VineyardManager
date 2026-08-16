import { formatRowLength, type Row, type RowStatus } from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const statusVariant: Record<
  RowStatus,
  "green" | "yellow" | "orange" | "muted"
> = {
  active: "green",
  fallow: "yellow",
  replanting: "orange",
  retired: "muted",
};

export function RowCard({ row }: { row: Row }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">{row.code}</p>
          <CardTitle className="mt-0.5">{row.name}</CardTitle>
          <CardDescription>{row.variety}</CardDescription>
        </div>
        <Badge variant={statusVariant[row.status]} className="capitalize">
          {row.status}
        </Badge>
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
