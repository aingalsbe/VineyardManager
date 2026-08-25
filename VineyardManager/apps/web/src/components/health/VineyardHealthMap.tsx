import { Link } from "react-router-dom";
import type { HealthColor, RowHealth } from "@vineyard/shared";
import { healthBarText, healthSwatch } from "@/lib/health";
import { cn } from "@/lib/utils";

const DEFAULT_LAYOUT: Record<string, { column: number; row: number }> = {
  S1: { column: 2, row: 1 },
  L1: { column: 1, row: 2 },
  S3: { column: 3, row: 2 },
  L2: { column: 2, row: 3 },
  S2: { column: 2, row: 4 },
  L3: { column: 2, row: 5 },
};

const overallBorder: Record<HealthColor, string> = {
  green: "border-health-green",
  yellow: "border-health-yellow",
  orange: "border-health-orange",
  red: "border-health-red",
};

function RowBar({ row }: { row: RowHealth }) {
  const primary = row.reasons[0]?.message;
  const label = `${row.code} ${row.name}`;
  const caption = primary ? `${row.score} · ${primary}` : String(row.score);

  return (
    <Link
      to={`/rows?row=${encodeURIComponent(row.code)}`}
      title={`${label} — ${caption}`}
      aria-label={`${label}, ${row.color} ${row.score}${primary ? `, ${primary}` : ""}`}
      className={cn(
        "block rounded-md px-3 py-2 text-left shadow-sm ring-offset-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
        healthSwatch[row.color],
        healthBarText[row.color],
        row.color === "green" && row.reasons[0]?.code === "row_retired"
          ? "opacity-70"
          : null,
      )}
    >
      <p className="font-semibold">
        {row.code}{" "}
        <span className="font-medium opacity-95">{row.name}</span>
      </p>
      <p className="text-sm opacity-90">{caption}</p>
    </Link>
  );
}

export function VineyardHealthMap({
  overallColor,
  rows,
}: {
  overallColor: HealthColor;
  rows: RowHealth[];
}) {
  const placed: Array<{ row: RowHealth; column: number; gridRow: number }> = [];
  const overflow: RowHealth[] = [];

  for (const row of rows) {
    const slot = DEFAULT_LAYOUT[row.code];
    if (slot) {
      placed.push({ row, column: slot.column, gridRow: slot.row });
    } else {
      overflow.push(row);
    }
  }

  overflow.sort((a, b) => a.code.localeCompare(b.code));
  const stacked = [
    ...placed
      .slice()
      .sort((a, b) => a.gridRow - b.gridRow || a.column - b.column)
      .map((item) => item.row),
    ...overflow,
  ];

  return (
    <div
      className={cn(
        "rounded-xl border-4 bg-background p-4",
        overallBorder[overallColor],
      )}
    >
      <ul className="grid gap-2 sm:hidden" aria-label="Vineyard health schematic">
        {stacked.map((row) => (
          <li key={row.rowId}>
            <RowBar row={row} />
          </li>
        ))}
      </ul>
      <div
        className="hidden sm:grid sm:grid-cols-3 sm:gap-2"
        role="list"
        aria-label="Vineyard health schematic"
      >
        {placed.map(({ row, column, gridRow }) => (
          <div
            key={row.rowId}
            role="listitem"
            style={{ gridColumn: column, gridRow }}
          >
            <RowBar row={row} />
          </div>
        ))}
      </div>
      {overflow.length > 0 ? (
        <ul className="mt-3 hidden gap-2 sm:grid">
          {overflow.map((row) => (
            <li key={row.rowId} className="sm:col-span-3">
              <RowBar row={row} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
