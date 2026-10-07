import type { PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { HealthColor } from "@vineyard/shared";
import { BAR_THICKNESS_PX } from "@vineyard/shared";

const FILL: Record<HealthColor | "neutral", string> = {
  green: "var(--color-health-green)",
  yellow: "var(--color-health-yellow)",
  orange: "var(--color-health-orange)",
  red: "var(--color-health-red)",
  neutral: "var(--color-border)",
};

const LABEL: Record<HealthColor | "neutral", string> = {
  green: "var(--color-primary-foreground)",
  yellow: "var(--color-foreground)",
  orange: "var(--color-primary-foreground)",
  red: "var(--color-primary-foreground)",
  neutral: "var(--color-foreground)",
};

export function RowLayoutBar({
  code,
  name,
  x,
  y,
  rotationDeg,
  length,
  color,
  quiet = false,
  href,
  onActivate,
  showRotateHandle = false,
  onMovePointerDown,
  onRotatePointerDown,
  highlighted = false,
  rowId,
  label,
  fullLabel,
}: {
  code: string;
  name: string;
  x: number;
  y: number;
  rotationDeg: number;
  length: number;
  color: HealthColor | "neutral";
  quiet?: boolean;
  href?: string;
  onActivate?: () => void;
  showRotateHandle?: boolean;
  onMovePointerDown?: (event: PointerEvent<SVGRectElement>) => void;
  onRotatePointerDown?: (event: PointerEvent<SVGCircleElement>) => void;
  /** Draw a primary-colored ring around the bar (not a health color). */
  highlighted?: boolean;
  /** Exposed as data-row-id so overlays can scroll/focus the bar. */
  rowId?: string;
  /** Short accessible label (e.g. "NS3 Merlot"); defaults to code + name. */
  label?: string;
  /** Tooltip text incl. row name (e.g. "NS3 Merlot · North South 3"). */
  fullLabel?: string;
}) {
  const shortLabel = label ?? `${code} ${name}`;
  const tooltip = fullLabel ?? shortLabel;
  const navigate = useNavigate();
  const half = length / 2;
  const thick = BAR_THICKNESS_PX;
  const clickable = Boolean(onActivate || href);
  const body = (
    <g
      transform={`translate(${x} ${y}) rotate(${rotationDeg})`}
      opacity={quiet ? 0.7 : 1}
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      data-row-id={rowId}
      data-highlighted={highlighted ? "true" : undefined}
      className={onActivate ? "outline-none" : undefined}
      aria-label={
        onActivate
          ? `${shortLabel}${highlighted ? ", highlighted" : ""}`
          : undefined
      }
      onClick={
        onActivate
          ? (event) => {
              event.stopPropagation();
              onActivate();
            }
          : undefined
      }
      onKeyDown={
        onActivate
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
    >
      {highlighted ? (
        <rect
          x={-half - 7}
          y={-thick / 2 - 7}
          width={length + 14}
          height={thick + 14}
          rx={11}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={4}
          style={{ pointerEvents: "none" }}
        />
      ) : null}
      <rect
        x={-half}
        y={-thick / 2}
        width={length}
        height={thick}
        rx={6}
        fill={FILL[color]}
        style={{
          cursor: onMovePointerDown
            ? "grab"
            : clickable
              ? "pointer"
              : "default",
        }}
        onPointerDown={onMovePointerDown}
      />
      <title>{tooltip}</title>
      <text
        x={0}
        y={1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={LABEL[color]}
        fontSize={13}
        fontWeight={600}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {code}
      </text>
      {showRotateHandle ? (
        <circle
          cx={half + 12}
          cy={0}
          r={7}
          fill="var(--color-card)"
          stroke="var(--color-primary)"
          strokeWidth={2}
          style={{ cursor: "grab" }}
          onPointerDown={onRotatePointerDown}
        />
      ) : null}
    </g>
  );

  if (onActivate) {
    return body;
  }

  if (href) {
    return (
      <a
        href={href}
        aria-label={shortLabel}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          navigate(href);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            navigate(href);
          }
        }}
      >
        {body}
      </a>
    );
  }
  return body;
}
