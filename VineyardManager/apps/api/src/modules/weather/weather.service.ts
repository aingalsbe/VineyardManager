import {
  calendarDateInZone,
  type VineyardWeather,
  type VineyardWeatherHistory,
  type WeatherAlert,
  type WeatherAlertSeverity,
  type WeatherHazard,
} from "@vineyard/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../middleware/error-handler.js";
import { serializeActivity } from "../../lib/serialize.js";
import {
  fetchCurrentAndDailyForecast,
  fetchPast24hPrecipitationInches,
  fetchWeatherHistoryDays,
  geocodeAddress,
  type GeoPoint,
  type OpenMeteoDaily,
  type OpenMeteoHistoryDay,
} from "./open-meteo.client.js";
import {
  WEATHER_FORECAST_CACHE_TTL_MS,
  WEATHER_HISTORY_CACHE_TTL_MS,
  cacheGet,
  cacheSet,
} from "./weather.cache.js";

export const RAIN_THRESHOLD_INCHES = 0.5;

/** Cache TTL for GET /weather and GET /weather/history (15 minutes). */
export const WEATHER_READ_CACHE_TTL_MS = WEATHER_FORECAST_CACHE_TTL_MS;

export type DailyRainCheckResult = {
  vineyardId: string;
  vineyardName: string;
  checkDate: string;
  timeZone: string;
  lat: number;
  lng: number;
  geocoded: boolean;
  rainInches: number;
  thresholdInches: number;
  windowStart: string;
  windowEnd: string;
  provider: "open-meteo";
  triggered: boolean;
  activityCreated: boolean;
  skippedReason: string | null;
  activity: ReturnType<typeof serializeActivity> | null;
};

function decimalToNumber(value: { toString(): string } | null): number | null {
  if (value == null) return null;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

/** Match activities.router date parsing: local noon for YYYY-MM-DD. */
function noonLocalIso(isoDate: string, _timeZone: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

export async function resolveVineyardPoint(vineyard: {
  id: string;
  address: string;
  lat: { toString(): string } | null;
  lng: { toString(): string } | null;
}): Promise<{ point: GeoPoint; geocoded: boolean }> {
  const lat = decimalToNumber(vineyard.lat);
  const lng = decimalToNumber(vineyard.lng);
  if (lat != null && lng != null) {
    return { point: { lat, lng }, geocoded: false };
  }

  const geocoded = await geocodeAddress(vineyard.address);
  if (!geocoded) {
    throw new HttpError(
      422,
      "LOCATION_UNRESOLVED",
      "Vineyard has no lat/lng and the stored address could not be geocoded. Set location in Setup.",
    );
  }

  await prisma.vineyard.update({
    where: { id: vineyard.id },
    data: {
      lat: new Prisma.Decimal(geocoded.lat),
      lng: new Prisma.Decimal(geocoded.lng),
    },
  });

  return { point: geocoded, geocoded: true };
}

async function findExistingRainActivity(
  vineyardId: string,
  checkDate: string,
) {
  const candidates = await prisma.activity.findMany({
    where: {
      vineyardId,
      deletedAt: null,
      activityType: "watering",
      source: "weather",
    },
    include: { row: { select: { id: true, code: true, name: true } } },
    orderBy: { performedAt: "desc" },
    take: 50,
  });

  return (
    candidates.find((activity) => {
      const details = activity.details;
      if (!details || typeof details !== "object" || Array.isArray(details)) {
        return false;
      }
      return (details as Record<string, unknown>).checkDate === checkDate;
    }) ?? null
  );
}

export async function runDailyRainCheck(
  vineyardId: string,
  options: { performedBy?: string | null; asOf?: Date; forceRainInches?: number } = {},
): Promise<DailyRainCheckResult> {
  const asOf = options.asOf ?? new Date();

  const vineyard = await prisma.vineyard.findFirst({
    where: { id: vineyardId, deletedAt: null },
  });
  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }

  const timeZone = vineyard.timezone || "America/Chicago";
  const checkDate = calendarDateInZone(asOf, timeZone);
  const { point, geocoded } = await resolveVineyardPoint(vineyard);

  const precip = await fetchPast24hPrecipitationInches(point, timeZone, asOf);
  if (options.forceRainInches != null && Number.isFinite(options.forceRainInches)) {
    precip.rainInches = Math.round(options.forceRainInches * 1000) / 1000;
  }
  const triggered = precip.rainInches >= RAIN_THRESHOLD_INCHES;

  const existing = await findExistingRainActivity(vineyard.id, checkDate);
  if (existing) {
    return {
      vineyardId: vineyard.id,
      vineyardName: vineyard.name,
      checkDate,
      timeZone,
      lat: point.lat,
      lng: point.lng,
      geocoded,
      rainInches: precip.rainInches,
      thresholdInches: RAIN_THRESHOLD_INCHES,
      windowStart: precip.windowStart,
      windowEnd: precip.windowEnd,
      provider: precip.provider,
      triggered,
      activityCreated: false,
      skippedReason: "already_logged_today",
      activity: serializeActivity(existing, null),
    };
  }

  if (!triggered) {
    return {
      vineyardId: vineyard.id,
      vineyardName: vineyard.name,
      checkDate,
      timeZone,
      lat: point.lat,
      lng: point.lng,
      geocoded,
      rainInches: precip.rainInches,
      thresholdInches: RAIN_THRESHOLD_INCHES,
      windowStart: precip.windowStart,
      windowEnd: precip.windowEnd,
      provider: precip.provider,
      triggered: false,
      activityCreated: false,
      skippedReason: "below_threshold",
      activity: null,
    };
  }

  const details: Prisma.InputJsonValue = {
    method: "rainfall",
    rainInches: precip.rainInches,
    windowStart: precip.windowStart,
    windowEnd: precip.windowEnd,
    provider: precip.provider,
    checkDate,
    notes: `Auto: ${precip.rainInches} in rain in past 24h (Open-Meteo)`,
  };

  const activity = await prisma.activity.create({
    data: {
      vineyardId: vineyard.id,
      rowId: null,
      scopeType: "vineyard",
      scopeId: vineyard.id,
      activityType: "watering",
      performedAt: noonLocalIso(checkDate, timeZone),
      performedBy: options.performedBy ?? null,
      details,
      source: "weather",
    },
    include: { row: { select: { id: true, code: true, name: true } } },
  });

  return {
    vineyardId: vineyard.id,
    vineyardName: vineyard.name,
    checkDate,
    timeZone,
    lat: point.lat,
    lng: point.lng,
    geocoded,
    rainInches: precip.rainInches,
    thresholdInches: RAIN_THRESHOLD_INCHES,
    windowStart: precip.windowStart,
    windowEnd: precip.windowEnd,
    provider: precip.provider,
    triggered: true,
    activityCreated: true,
    skippedReason: null,
    activity: serializeActivity(activity, null),
  };
}

export async function runDailyRainCheckForAllVineyards(
  options: { asOf?: Date } = {},
): Promise<DailyRainCheckResult[]> {
  const vineyards = await prisma.vineyard.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const results: DailyRainCheckResult[] = [];
  for (const vineyard of vineyards) {
    try {
      results.push(await runDailyRainCheck(vineyard.id, options));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown rain-check error";
      console.error(
        `[weather] daily rain check failed for ${vineyard.name} (${vineyard.id}): ${message}`,
      );
    }
  }
  return results;
}

function alertId(hazard: WeatherHazard, date: string, suffix: string): string {
  return `derived-${hazard}-${date}-${suffix}`;
}

/**
 * Derive FR-adjacent hazard proxies from Open-Meteo daily forecast.
 * Open-Meteo has no official NWS alert feed — hail/tornado official watches
 * are not available; hail codes 96/99 are included as a weak proxy only.
 * Returns [] when nothing crosses thresholds.
 */
export function deriveAlertsFromForecast(
  daily: OpenMeteoDaily[],
  historyDays: OpenMeteoHistoryDay[] = [],
): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  const seen = new Set<string>();

  const push = (alert: WeatherAlert) => {
    const key = `${alert.hazard}:${alert.startsAt ?? alert.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    alerts.push(alert);
  };

  for (const day of daily) {
    const dayStart = `${day.date}T00:00:00.000Z`;
    const dayEnd = `${day.date}T23:59:59.000Z`;

    if (day.tempMinF <= 32) {
      const severity: WeatherAlertSeverity =
        day.tempMinF <= 28 ? "severe" : "moderate";
      push({
        id: alertId("frost", day.date, "min"),
        hazard: "frost",
        severity,
        title: "Frost risk",
        description: `Forecast low ${day.tempMinF}°F on ${day.date}. Protect tender growth if vines are active.`,
        startsAt: dayStart,
        endsAt: dayEnd,
        source: "derived",
      });
    }

    if (day.windMphMax != null && day.windMphMax >= 35) {
      const severity: WeatherAlertSeverity =
        day.windMphMax >= 50 ? "severe" : day.windMphMax >= 40 ? "moderate" : "minor";
      push({
        id: alertId("wind", day.date, "max"),
        hazard: "wind",
        severity,
        title: "High wind",
        description: `Forecast max wind ${day.windMphMax} mph on ${day.date}.`,
        startsAt: dayStart,
        endsAt: dayEnd,
        source: "derived",
      });
    }

    if (day.precipInches >= 1.0 || (day.precipProbabilityPct ?? 0) >= 80) {
      const severity: WeatherAlertSeverity =
        day.precipInches >= 2.0 ? "severe" : "moderate";
      push({
        id: alertId("rain", day.date, "precip"),
        hazard: "rain",
        severity,
        title: "Heavy rain",
        description: `Forecast ${day.precipInches} in precip` +
          (day.precipProbabilityPct != null
            ? ` (${day.precipProbabilityPct}% chance)`
            : "") +
          ` on ${day.date}.`,
        startsAt: dayStart,
        endsAt: dayEnd,
        source: "derived",
      });
    }

    // Snow: WMO snow codes 71–77, 85–86
    if (
      (day.weatherCode >= 71 && day.weatherCode <= 77) ||
      day.weatherCode === 85 ||
      day.weatherCode === 86
    ) {
      push({
        id: alertId("snow", day.date, "code"),
        hazard: "snow",
        severity: day.weatherCode >= 75 ? "moderate" : "minor",
        title: "Snow",
        description: `${day.summary} expected on ${day.date}.`,
        startsAt: dayStart,
        endsAt: dayEnd,
        source: "derived",
      });
    }

    // Weak hail proxy from thunderstorm+hail WMO codes (not an official alert)
    if (day.weatherCode === 96 || day.weatherCode === 99) {
      push({
        id: alertId("hail", day.date, "code"),
        hazard: "hail",
        severity: day.weatherCode === 99 ? "severe" : "moderate",
        title: "Possible hail",
        description: `${day.summary} on ${day.date} (model weather code; not an NWS warning).`,
        startsAt: dayStart,
        endsAt: dayEnd,
        source: "derived",
      });
    }
  }

  // Drought proxy: little precip in recent history + dry outlook
  if (historyDays.length >= 7) {
    const recent = historyDays.slice(-14);
    const totalRecent = recent.reduce((sum, d) => sum + d.precipInches, 0);
    const outlookPrecip = daily.reduce((sum, d) => sum + d.precipInches, 0);
    if (totalRecent < 0.25 && outlookPrecip < 0.35) {
      const startDate = recent[0]?.date ?? daily[0]?.date ?? null;
      push({
        id: alertId("drought", startDate ?? "window", "dry"),
        hazard: "drought",
        severity: totalRecent < 0.1 ? "moderate" : "minor",
        title: "Dry stretch",
        description: `Only ${Math.round(totalRecent * 1000) / 1000} in rain in the last ${recent.length} archive days and a dry 7-day outlook (${Math.round(outlookPrecip * 1000) / 1000} in). Consider irrigation.`,
        startsAt: startDate ? `${startDate}T00:00:00.000Z` : null,
        endsAt: (() => {
          const last = daily[daily.length - 1];
          return last ? `${last.date}T23:59:59.000Z` : null;
        })(),
        source: "derived",
      });
    }
  }

  // Tornado: no reliable Open-Meteo signal — intentionally omitted.
  return alerts;
}

type ForecastPayload = Omit<
  VineyardWeather,
  "cached" | "cacheExpiresAt" | "fetchedAt"
> & { fetchedAt: string };

export async function getVineyardWeather(
  vineyardId: string,
): Promise<VineyardWeather> {
  const cacheKey = `weather:forecast:${vineyardId}`;
  const cached = cacheGet<ForecastPayload>(cacheKey);
  if (cached) {
    return {
      ...cached.value,
      fetchedAt: cached.fetchedAt,
      cached: true,
      cacheExpiresAt: new Date(cached.expiresAt).toISOString(),
    };
  }

  const vineyard = await prisma.vineyard.findFirst({
    where: { id: vineyardId, deletedAt: null },
  });
  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }

  const timeZone = vineyard.timezone || "America/Chicago";
  let point: GeoPoint;
  let geocoded: boolean;
  try {
    ({ point, geocoded } = await resolveVineyardPoint(vineyard));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      422,
      "LOCATION_UNRESOLVED",
      "Vineyard location could not be resolved.",
    );
  }

  let forecast;
  try {
    forecast = await fetchCurrentAndDailyForecast(point, timeZone);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Weather provider error";
    throw new HttpError(502, "WEATHER_UNAVAILABLE", message);
  }

  // Best-effort history for drought proxy; ignore archive failures
  let historyDays: OpenMeteoHistoryDay[] = [];
  try {
    historyDays = await fetchWeatherHistoryDays(point, timeZone, 14);
  } catch {
    historyDays = [];
  }

  const alerts = deriveAlertsFromForecast(forecast.daily, historyDays);
  const fetchedAt = new Date().toISOString();

  const payload: ForecastPayload = {
    vineyardId: vineyard.id,
    timeZone,
    lat: point.lat,
    lng: point.lng,
    geocoded,
    provider: "open-meteo",
    fetchedAt,
    current: forecast.current,
    daily: forecast.daily,
    alerts,
  };

  const entry = cacheSet(cacheKey, payload, WEATHER_FORECAST_CACHE_TTL_MS);
  return {
    ...payload,
    cached: false,
    cacheExpiresAt: new Date(entry.expiresAt).toISOString(),
  };
}

type HistoryPayload = Omit<
  VineyardWeatherHistory,
  "cached" | "cacheExpiresAt" | "fetchedAt"
> & { fetchedAt: string };

export async function getVineyardWeatherHistory(
  vineyardId: string,
  dayCount: number = 14,
): Promise<VineyardWeatherHistory> {
  const days = Math.min(90, Math.max(1, Math.trunc(dayCount) || 14));
  const cacheKey = `weather:history:${vineyardId}:${days}`;
  const cached = cacheGet<HistoryPayload>(cacheKey);
  if (cached) {
    return {
      ...cached.value,
      fetchedAt: cached.fetchedAt,
      cached: true,
      cacheExpiresAt: new Date(cached.expiresAt).toISOString(),
    };
  }

  const vineyard = await prisma.vineyard.findFirst({
    where: { id: vineyardId, deletedAt: null },
  });
  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }

  const timeZone = vineyard.timezone || "America/Chicago";
  let point: GeoPoint;
  try {
    ({ point } = await resolveVineyardPoint(vineyard));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      422,
      "LOCATION_UNRESOLVED",
      "Vineyard location could not be resolved.",
    );
  }

  let historyDays: OpenMeteoHistoryDay[];
  try {
    historyDays = await fetchWeatherHistoryDays(point, timeZone, days);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Weather provider error";
    throw new HttpError(502, "WEATHER_UNAVAILABLE", message);
  }

  const fetchedAt = new Date().toISOString();
  const payload: HistoryPayload = {
    vineyardId: vineyard.id,
    timeZone,
    provider: "open-meteo",
    fetchedAt,
    days: historyDays,
  };

  const entry = cacheSet(cacheKey, payload, WEATHER_HISTORY_CACHE_TTL_MS);
  return {
    ...payload,
    cached: false,
    cacheExpiresAt: new Date(entry.expiresAt).toISOString(),
  };
}
