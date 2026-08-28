import {
  BAR_THICKNESS_PX,
  barLengthPx,
  LAYOUT_CANVAS,
  layoutFromDefaultGrid,
  snapRotationDeg,
  type HealthColor,
  type Row,
  type RowHealth,
  type RowLayout,
  type RowLayoutPlacement,
  type RowStatus,
} from "@vineyard/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { RowLayoutBar } from "@/components/health/RowLayoutBar";
import { Button } from "@/components/ui/button";
import { ApiError, updateVineyard } from "@/lib/api";

type DragMode =
  | { kind: "move"; rowId: string; offsetX: number; offsetY: number }
  | { kind: "rotate"; rowId: string }
  | { kind: "place"; rowId: string }
  | null;

function svgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const mapped = pt.matrixTransform(ctm.inverse());
  return { x: mapped.x, y: mapped.y };
}

function placementsEqual(a: RowLayoutPlacement[], b: RowLayoutPlacement[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((item) => [item.rowId, item]));
  return a.every((item) => {
    const other = byId.get(item.rowId);
    if (!other) return false;
    return (
      item.x === other.x &&
      item.y === other.y &&
      item.rotationDeg === other.rotationDeg
    );
  });
}

export function RowLayoutEditor({
  vineyardId,
  rows,
  savedLayout,
  healthByRowId,
  onSaved,
}: {
  vineyardId: string;
  rows: Row[];
  savedLayout: RowLayout | null;
  healthByRowId: Map<string, RowHealth>;
  onSaved: () => Promise<void> | void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const placementsRef = useRef<RowLayoutPlacement[]>([]);
  const [placements, setPlacements] = useState<RowLayoutPlacement[]>(() =>
    savedLayout?.rows.length
      ? savedLayout.rows
      : layoutFromDefaultGrid(rows.map((row) => ({ id: row.id, code: row.code })))
          .rows,
  );
  const [drag, setDrag] = useState<DragMode>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = savedLayout?.rows.length
      ? savedLayout.rows
      : layoutFromDefaultGrid(
          rows.map((row) => ({ id: row.id, code: row.code })),
        ).rows;
    setPlacements(next);
  }, [savedLayout, rows]);

  useEffect(() => {
    placementsRef.current = placements;
  }, [placements]);

  const rowById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows],
  );
  const placedIds = useMemo(
    () => new Set(placements.map((item) => item.rowId)),
    [placements],
  );
  const tray = rows.filter((row) => !placedIds.has(row.id));
  const knownIds = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);
  const visible = placements.filter((item) => knownIds.has(item.rowId));

  const savedPlacements = savedLayout?.rows ?? [];
  const dirty = !placementsEqual(visible, savedPlacements);

  function colorFor(row: Row): HealthColor | "neutral" {
    return healthByRowId.get(row.id)?.color ?? "neutral";
  }

  function quiet(status: RowStatus): boolean {
    return status === "retired" || status === "fallow";
  }

  useEffect(() => {
    if (!drag) return;
    const active = drag;

    function onMove(event: PointerEvent) {
      const svg = svgRef.current;
      if (!svg) return;
      const point = svgPoint(svg, event.clientX, event.clientY);
      if (active.kind === "move") {
        setPlacements((current) =>
          current.map((item) =>
            item.rowId === active.rowId
              ? { ...item, x: point.x - active.offsetX, y: point.y - active.offsetY }
              : item,
          ),
        );
      } else if (active.kind === "rotate") {
        const current = placementsRef.current.find(
          (item) => item.rowId === active.rowId,
        );
        if (!current) return;
        const deg =
          (Math.atan2(point.y - current.y, point.x - current.x) * 180) / Math.PI;
        setPlacements((items) =>
          items.map((item) =>
            item.rowId === active.rowId
              ? { ...item, rotationDeg: snapRotationDeg(deg) }
              : item,
          ),
        );
      }
    }

    function onUp(event: PointerEvent) {
      if (active.kind === "place") {
        const svg = svgRef.current;
        if (svg) {
          const rect = svg.getBoundingClientRect();
          if (
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom
          ) {
            const point = svgPoint(svg, event.clientX, event.clientY);
            setPlacements((current) => [
              ...current.filter((item) => item.rowId !== active.rowId),
              { rowId: active.rowId, x: point.x, y: point.y, rotationDeg: 0 },
            ]);
          }
        }
      }
      setDrag(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag]);

  async function save(next: RowLayoutPlacement[]) {
    setSaving(true);
    setError(null);
    try {
      await updateVineyard(vineyardId, {
        rowLayout: { version: 1, rows: next },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save layout");
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    if (
      !window.confirm(
        "Reset the layout to the default schematic? This saves immediately.",
      )
    ) {
      return;
    }
    const next = layoutFromDefaultGrid(
      rows.map((row) => ({ id: row.id, code: row.code })),
    ).rows;
    setPlacements(next);
    await save(next);
  }

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${LAYOUT_CANVAS.width} ${LAYOUT_CANVAS.height}`}
        className="w-full touch-none rounded-lg border border-border bg-background"
        role="img"
        aria-label="Row layout pad"
      >
        <rect
          width={LAYOUT_CANVAS.width}
          height={LAYOUT_CANVAS.height}
          fill="var(--color-background)"
        />
        {visible.map((item) => {
          const row = rowById.get(item.rowId);
          if (!row) return null;
          return (
            <RowLayoutBar
              key={item.rowId}
              code={row.code}
              name={row.name}
              x={item.x}
              y={item.y}
              rotationDeg={item.rotationDeg}
              length={barLengthPx(row.vineCount, row.lengthFeet, row.lengthInches)}
              color={colorFor(row)}
              quiet={quiet(row.status)}
              showRotateHandle
              onMovePointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const svg = svgRef.current;
                if (!svg) return;
                const point = svgPoint(svg, event.clientX, event.clientY);
                setDrag({
                  kind: "move",
                  rowId: item.rowId,
                  offsetX: point.x - item.x,
                  offsetY: point.y - item.y,
                });
              }}
              onRotatePointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDrag({ kind: "rotate", rowId: item.rowId });
              }}
            />
          );
        })}
      </svg>

      {tray.length > 0 ? (
        <div className="mt-3">
          <p className="mb-2 text-sm font-medium">Unplaced rows — drag onto the pad</p>
          <ul className="flex flex-wrap gap-2">
            {tray.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="cursor-grab rounded-md px-3 py-2 text-sm font-semibold text-primary-foreground"
                  style={{
                    background: "var(--color-primary)",
                    minWidth: barLengthPx(row.vineCount, row.lengthFeet, row.lengthInches) / 2,
                    height: BAR_THICKNESS_PX,
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setDrag({ kind: "place", rowId: row.id });
                  }}
                >
                  {row.code} · {row.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm font-medium text-health-red" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save(visible)}
        >
          {saving ? "Saving…" : "Save layout"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => void onReset()}
        >
          Reset to default schematic
        </Button>
      </div>
    </div>
  );
}
