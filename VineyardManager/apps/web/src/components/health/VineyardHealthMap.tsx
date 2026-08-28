import {
  barLengthPx,
  LAYOUT_CANVAS,
  layoutFromDefaultGrid,
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
}: {
  overallColor: HealthColor;
  healthRows: RowHealth[];
  vineyardRows: Row[];
  rowLayout: RowLayout | null;
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

  return (
    <div
      className={cn(
        "rounded-xl border-4 bg-background p-4",
        overallBorder[overallColor],
      )}
    >
      <svg
        viewBox={`0 0 ${LAYOUT_CANVAS.width} ${LAYOUT_CANVAS.height}`}
        className="w-full"
        role="img"
        aria-label="Vineyard health map"
      >
        <rect
          width={LAYOUT_CANVAS.width}
          height={LAYOUT_CANVAS.height}
          fill="var(--color-background)"
        />
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
              href={`/rows?row=${encodeURIComponent(row.code)}`}
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
                <a
                  href={`/rows?row=${encodeURIComponent(row.code)}`}
                  className="block"
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
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
