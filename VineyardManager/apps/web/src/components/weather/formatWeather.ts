/** Format ISO date (YYYY-MM-DD or full) as weekday short label. */
export function formatDayLabel(isoDate: string, timeZone?: string): string {
  const date = parseWeatherDate(isoDate);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    timeZone,
  });
}

export function formatObservedAt(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function formatAlertWindow(
  startsAt: string | null,
  endsAt: string | null,
  timeZone?: string,
): string | null {
  if (!startsAt && !endsAt) return null;
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  };
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    return `${start.toLocaleString(undefined, opts)} – ${end.toLocaleString(undefined, opts)}`;
  }
  if (start && !Number.isNaN(start.getTime())) {
    return `From ${start.toLocaleString(undefined, opts)}`;
  }
  if (end && !Number.isNaN(end.getTime())) {
    return `Until ${end.toLocaleString(undefined, opts)}`;
  }
  return null;
}

function parseWeatherDate(isoDate: string): Date {
  // Date-only strings parse as UTC midnight; attach noon local-safe via T12:00:00
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return new Date(`${isoDate}T12:00:00`);
  }
  return new Date(isoDate);
}

export function formatTemp(value: number): string {
  return `${Math.round(value)}°`;
}

export function formatPrecipInches(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(value >= 1 ? 1 : 2)} in`;
}

export function formatMph(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)} mph`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}
