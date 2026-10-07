import {
  formatRowLength,
  type HealthColor,
  type Row,
} from "@vineyard/shared";
import { Pencil, Trash2 } from "lucide-react";
import { RowStatusBadge } from "@/components/rows/RowStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  OverflowMenu,
  type OverflowMenuItem,
} from "@/components/ui/overflow-menu";
import { healthSwatch } from "@/lib/health";
import { cn } from "@/lib/utils";
import { rowFullLabel, rowLabel, rowVarietyText } from "@/lib/rowLabel";

export function RowCard({
  row,
  onEdit,
  onRecordHarvest,
  onDelete,
  health,
  highlighted = false,
}: {
  row: Row;
  onEdit?: (row: Row) => void;
  onRecordHarvest?: (row: Row) => void;
  /** Caller confirms before deleting. Omit for viewers. */
  onDelete?: (row: Row) => void;
  health?: { color: HealthColor; reason?: string } | null;
  highlighted?: boolean;
}) {
  // Secondary/write actions live in the ⋯ menu so the header never
  // overflows at 390px. Viewers get no handlers, so no menu.
  const menuItems: OverflowMenuItem[] = [
    ...(onEdit
      ? [
          {
            key: "edit",
            label: "Edit row",
            icon: <Pencil className="size-4" aria-hidden />,
            onSelect: () => onEdit(row),
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            key: "delete",
            label: "Delete row",
            icon: <Trash2 className="size-4" aria-hidden />,
            destructive: true,
            onSelect: () => onDelete(row),
          },
        ]
      : []),
  ];

  return (
    <Card className={cn("min-w-0", highlighted && "ring-2 ring-primary")}>
      {/* Under sm the badge + ⋯ get their own line above the label so long
          codes/varieties use the full card width; sm+ keeps them inline. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="min-w-0 sm:flex-1">
          <CardTitle className="[overflow-wrap:anywhere]" title={rowFullLabel(row)}>
            {rowLabel(row)}
          </CardTitle>
          <CardDescription className="[overflow-wrap:anywhere]">
            {row.name}
            {rowVarietyText(row) && rowVarietyText(row) !== row.variety
              ? ` · ${row.variety}`
              : ""}
          </CardDescription>
          {health ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-muted">
              <span
                className={`mt-1 size-2.5 shrink-0 rounded-full ${healthSwatch[health.color]}`}
                aria-hidden
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="font-medium capitalize text-foreground">
                  {health.color}
                </span>
                {health.reason ? ` — ${health.reason}` : ""}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-start">
          <RowStatusBadge status={row.status} />
          <OverflowMenu
            label={`More actions for ${rowLabel(row)}`}
            items={menuItems}
          />
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
        <p className="mt-4 text-sm [overflow-wrap:anywhere] text-muted">{row.notes}</p>
      ) : null}
      {onRecordHarvest ? (
        <div className="mt-4 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onRecordHarvest(row)}
          >
            Record harvest
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
