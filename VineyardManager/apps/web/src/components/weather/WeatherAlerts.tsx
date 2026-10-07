import { useId, useState } from "react";
import {
  WEATHER_HAZARD_LABELS,
  type WeatherAlert,
  type WeatherAlertSeverity,
} from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAlertWindow } from "@/components/weather/formatWeather";
import { cn } from "@/lib/utils";

const SEVERITY_LABEL: Record<WeatherAlertSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
  extreme: "Extreme",
};

/** Severity badges use primary/muted — never health-* colors. */
function severityBadgeVariant(
  severity: WeatherAlertSeverity,
): "muted" | "default" {
  if (severity === "minor") return "muted";
  return "default";
}

function severityBadgeClass(severity: WeatherAlertSeverity): string | undefined {
  if (severity === "severe" || severity === "extreme") {
    return "border border-primary/40 font-semibold";
  }
  return undefined;
}

function AlertItem({
  alert,
  timeZone,
}: {
  alert: WeatherAlert;
  timeZone?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const long = alert.description.trim().length > 140;
  const windowLabel = formatAlertWindow(alert.startsAt, alert.endsAt, timeZone);
  const hazardLabel = WEATHER_HAZARD_LABELS[alert.hazard] ?? alert.hazard;

  return (
    <li className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{alert.title}</p>
          <p className="mt-0.5 text-sm text-muted">
            {hazardLabel}
            {windowLabel ? ` · ${windowLabel}` : ""}
          </p>
        </div>
        <Badge
          variant={severityBadgeVariant(alert.severity)}
          className={severityBadgeClass(alert.severity)}
        >
          {SEVERITY_LABEL[alert.severity]}
        </Badge>
      </div>
      {alert.description.trim() ? (
        <div className="mt-2">
          <p
            id={panelId}
            className={cn(
              "text-sm text-muted",
              !expanded && long && "line-clamp-2",
            )}
          >
            {alert.description}
          </p>
          {long ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="mt-1 h-auto min-h-11 px-0"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Show less" : "Show more"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function WeatherAlerts({
  alerts,
  timeZone,
}: {
  alerts: WeatherAlert[];
  timeZone?: string;
}) {
  if (alerts.length === 0) {
    return <p className="text-sm text-muted">No alerts</p>;
  }

  return (
    <ul className="space-y-2" aria-label="Weather alerts">
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} timeZone={timeZone} />
      ))}
    </ul>
  );
}
