import {
  barLengthPx,
  layoutFromDefaultGrid,
  layoutViewBox,
  type HealthColor,
  type Row,
  type RowHealth,
  type RowLayout,
} from "@vineyard/shared";
import { RowLayoutBar } from "@/components/health/RowLayoutBar";
import { cn } from "@/lib/utils";

const overallBorder: Record<HealthColor, string> = {
  green: "border-health-green",
  yellow: "border-health-yellow",
  orange: "border-health-orange",
  red: "border-health-red",
};

export function VineyardHealthMap({
  overallColor,
  healthRows,
  vineyardRows,
  rowLayout,
  onSelectRow,
  className,
}: {
  overallColor: HealthColor;
  healthRows: RowHealth[];
  vineyardRows: Row[];
  rowLayout: RowLayout | null;
  onSelectRow?: (rowId: string) => void;
  className?: string;
}) {
  const healthById = new Map(healthRows.map((row) => [row.rowId, row]));
  const rowById = new Map(vineyardRows.map((row) => [row.id, row]));
  const knownIds = new Set(vineyardRows.map((row) => row.id));

  const placements = (
    rowLayout?.rows.length
      ? rowLayout.rows
      : layoutFromDefaultGrid(
          vineyardRows.map((row) => ({ id: row.id, code: row.code })),
        ).rows
  ).filter((item) => knownIds.has(item.rowId));

  const placedIds = new Set(placements.map((item) => item.rowId));
  const unplaced = vineyardRows.filter((row) => !placedIds.has(row.id));
  const lengths = placements.map((item) => {
    const row = rowById.get(item.rowId);
    return barLengthPx(
      row?.vineCount ?? 0,
      row?.lengthFeet ?? 0,
      row?.lengthInches ?? 0,
    );
  });
  const viewBox = layoutViewBox(placements, lengths);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border-4 bg-background p-3 md:p-4",
        overallBorder[overallColor],
        className,
      )}
    >
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block h-auto max-h-[min(400px,42vh)] max-w-full"
        role="img"
        aria-label="Vineyard health map"
      >
        {placements.map((item) => {
          const row = rowById.get(item.rowId);
          if (!row) return null;
          const health = healthById.get(row.id);
          return (
            <RowLayoutBar
              key={item.rowId}
              code={row.code}
              name={row.name}
              x={item.x}
              y={item.y}
              rotationDeg={item.rotationDeg}
              length={barLengthPx(row.vineCount, row.lengthFeet, row.lengthInches)}
              color={health?.color ?? "neutral"}
              quiet={row.status === "retired" || row.status === "fallow"}
              onActivate={
                onSelectRow ? () => onSelectRow(row.id) : undefined
              }
            />
          );
        })}
      </svg>
      {unplaced.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Rows not on the map">
          {unplaced.map((row) => {
            const health = healthById.get(row.id);
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className="block"
                  onClick={() => onSelectRow?.(row.id)}
                >
                  <span className="sr-only">{row.code} {row.name}</span>
                  <svg
                    width={barLengthPx(row.vineCount, row.lengthFeet, row.lengthInches)}
                    height={32}
                    aria-hidden
                  >
                    <RowLayoutBar
                      code={row.code}
                      name={row.name}
                      x={barLengthPx(row.vineCount, row.lengthFeet, row.lengthInches) / 2}
                      y={16}
                      rotationDeg={0}
                      length={barLengthPx(row.vineCount, row.lengthFeet, row.lengthInches)}
                      color={health?.color ?? "neutral"}
                      quiet={row.status === "retired" || row.status === "fallow"}
                    />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
