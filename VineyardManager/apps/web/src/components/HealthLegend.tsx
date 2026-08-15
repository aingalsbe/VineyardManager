import { HEALTH_COLORS } from "@vineyard/shared";
import { healthMeaning, healthRangeLabel, healthSwatch } from "@/lib/health";

export function HealthLegend() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {HEALTH_COLORS.map((color) => (
        <li
          key={color}
          className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
        >
          <span
            className={`mt-1 size-3.5 shrink-0 rounded-full ${healthSwatch[color]}`}
            aria-hidden
          />
          <div>
            <p className="font-medium capitalize">
              {color}{" "}
              <span className="font-normal text-muted">
                {healthRangeLabel[color]}
              </span>
            </p>
            <p className="text-sm text-muted">{healthMeaning[color]}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
