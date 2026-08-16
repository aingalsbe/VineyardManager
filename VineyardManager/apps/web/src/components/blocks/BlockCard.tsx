import type { Block, BlockStatus } from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const statusVariant: Record<
  BlockStatus,
  "green" | "yellow" | "orange" | "muted"
> = {
  active: "green",
  fallow: "yellow",
  replanting: "orange",
  retired: "muted",
};

function formatAcres(acres: number): string {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(acres)} ac`;
}

export function BlockCard({ block }: { block: Block }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">{block.code}</p>
          <CardTitle className="mt-0.5">{block.name}</CardTitle>
          <CardDescription>{block.variety}</CardDescription>
        </div>
        <Badge variant={statusVariant[block.status]} className="capitalize">
          {block.status}
        </Badge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted">Acreage</dt>
          <dd className="font-medium">{formatAcres(block.acreage)}</dd>
        </div>
        <div>
          <dt className="text-muted">Planted</dt>
          <dd className="font-medium">{block.plantedYear}</dd>
        </div>
      </dl>
      {block.notes ? (
        <p className="mt-4 text-sm text-muted">{block.notes}</p>
      ) : null}
    </Card>
  );
}
