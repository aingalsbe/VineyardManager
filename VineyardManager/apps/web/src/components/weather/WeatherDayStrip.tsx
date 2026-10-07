import type { WeatherDaily } from "@vineyard/shared";
import {
  formatDayLabel,
  formatPct,
  formatTemp,
} from "@/components/weather/formatWeather";
import { weatherIconForCode } from "@/components/weather/weatherIcons";
import { cn } from "@/lib/utils";

export function WeatherDayStrip({
  days,
  timeZone,
}: {
  days: WeatherDaily[];
  timeZone?: string;
}) {
  return (
    <ul
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      aria-label="Seven-day forecast"
    >
      {days.map((day) => {
        const Icon = weatherIconForCode(day.weatherCode);
        const precip =
          day.precipProbabilityPct != null
            ? formatPct(day.precipProbabilityPct)
            : null;
        return (
          <li
            key={day.date}
            className={cn(
              "flex w-[6.5rem] shrink-0 flex-col items-center gap-1 rounded-lg border border-border bg-background px-2 py-3 text-center",
            )}
          >
            <p className="text-sm font-medium text-foreground">
              {formatDayLabel(day.date, timeZone)}
            </p>
            <Icon
              className="size-6 text-primary"
              aria-hidden
            />
            <p className="sr-only">{day.summary}</p>
            <p className="line-clamp-2 min-h-[2.5rem] text-xs text-muted">
              {day.summary}
            </p>
            <p className="text-sm font-semibold tracking-tight">
              <span className="text-foreground">{formatTemp(day.tempMaxF)}</span>
              <span className="text-muted"> / </span>
              <span className="text-muted">{formatTemp(day.tempMinF)}</span>
            </p>
            {precip ? (
              <p className="text-xs text-muted">
                <span className="sr-only">Precipitation chance </span>
                {precip}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
