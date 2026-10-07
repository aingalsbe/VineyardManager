/**
 * Open-Meteo forecast + archive + geocoding helpers.
 * Location always comes from the vineyard record (lat/lng, else address).
 *
 * Alerts: Open-Meteo has no NWS-style alert feed. Derived frost / wind /
 * heavy precip / drought proxies are built in weather.service from forecast
 * fields. Hail and tornado official alerts are not available from this provider.
 */

import { weatherCodeSummary } from "@vineyard/shared";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "VineyardManager/0.1 (local vineyard ops)";

export type GeoPoint = { lat: number; lng: number };

export type PrecipitationWindow = {
  rainInches: number;
  windowStart: string;
  windowEnd: string;
  provider: "open-meteo";
};

export type OpenMeteoCurrent = {
  observedAt: string;
  tempF: number;
  feelsLikeF: number | null;
  humidityPct: number | null;
  precipInches: number | null;
  windMph: number | null;
  windGustMph: number | null;
  weatherCode: number;
  summary: string;
};

export type OpenMeteoDaily = {
  date: string;
  tempMaxF: number;
  tempMinF: number;
  precipInches: number;
  precipProbabilityPct: number | null;
  windMphMax: number | null;
  weatherCode: number;
  summary: string;
};

export type OpenMeteoForecastBundle = {
  current: OpenMeteoCurrent;
  daily: OpenMeteoDaily[];
  provider: "open-meteo";
};

export type OpenMeteoHistoryDay = {
  date: string;
  precipInches: number;
  tempMaxF: number | null;
  tempMinF: number | null;
  windMphMax: number | null;
};

type ForecastResponse = {
  hourly?: {
    time?: Array<string | number>;
    precipitation?: Array<number | null>;
  };
  current?: {
    time?: string;
    temperature_2m?: number | null;
    apparent_temperature?: number | null;
    relative_humidity_2m?: number | null;
    precipitation?: number | null;
    wind_speed_10m?: number | null;
    wind_gusts_10m?: number | null;
    weather_code?: number | null;
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    precipitation_sum?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
    wind_speed_10m_max?: Array<number | null>;
    weather_code?: Array<number | null>;
  };
};

type ArchiveResponse = {
  daily?: {
    time?: string[];
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    precipitation_sum?: Array<number | null>;
    wind_speed_10m_max?: Array<number | null>;
  };
};

type OpenMeteoGeocodeResponse = {
  results?: Array<{ latitude: number; longitude: number; name?: string }>;
};

type NominatimResult = Array<{ lat: string; lon: string }>;

function roundInches(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function numOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function fetchPast24hPrecipitationInches(
  point: GeoPoint,
  timeZone: string,
  asOf: Date = new Date(),
): Promise<PrecipitationWindow> {
  const windowEnd = asOf;
  const windowStart = new Date(asOf.getTime() - 24 * 60 * 60 * 1000);

  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", String(point.lat));
  url.searchParams.set("longitude", String(point.lng));
  url.searchParams.set("hourly", "precipitation");
  url.searchParams.set("past_days", "2");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", timeZone);
  url.searchParams.set("timeformat", "unixtime");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo forecast failed (${response.status})`);
  }

  const body = (await response.json()) as ForecastResponse;
  const times = body.hourly?.time ?? [];
  const values = body.hourly?.precipitation ?? [];

  let sum = 0;
  for (let i = 0; i < times.length; i += 1) {
    const stamp = times[i];
    if (stamp == null) continue;
    // unixtime = seconds; ISO strings still accepted as fallback
    const hour =
      typeof stamp === "number"
        ? new Date(stamp * 1000)
        : new Date(stamp);
    if (Number.isNaN(hour.getTime())) continue;
    if (hour > windowEnd || hour <= windowStart) continue;
    const inches = values[i];
    if (typeof inches === "number" && Number.isFinite(inches)) {
      sum += inches;
    }
  }

  return {
    rainInches: roundInches(sum),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    provider: "open-meteo",
  };
}

/**
 * Current conditions + 7-day daily outlook (imperial units).
 */
export async function fetchCurrentAndDailyForecast(
  point: GeoPoint,
  timeZone: string,
): Promise<OpenMeteoForecastBundle> {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", String(point.lat));
  url.searchParams.set("longitude", String(point.lng));
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "wind_speed_10m",
      "wind_gusts_10m",
      "weather_code",
    ].join(","),
  );
  url.searchParams.set(
    "daily",
    [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "weather_code",
    ].join(","),
  );
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", timeZone);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo forecast failed (${response.status})`);
  }

  const body = (await response.json()) as ForecastResponse;
  const cur = body.current;
  if (!cur || cur.temperature_2m == null || cur.weather_code == null) {
    throw new Error("Open-Meteo forecast missing current conditions");
  }

  const weatherCode = Math.trunc(cur.weather_code);
  const observedAtRaw = cur.time ?? new Date().toISOString();
  const observedAt = observedAtRaw.includes("T")
    ? new Date(observedAtRaw).toISOString()
    : new Date(`${observedAtRaw}T12:00:00`).toISOString();

  const current: OpenMeteoCurrent = {
    observedAt: Number.isNaN(new Date(observedAt).getTime())
      ? new Date().toISOString()
      : observedAt,
    tempF: round1(cur.temperature_2m),
    feelsLikeF:
      numOrNull(cur.apparent_temperature) != null
        ? round1(cur.apparent_temperature as number)
        : null,
    humidityPct: numOrNull(cur.relative_humidity_2m),
    precipInches:
      numOrNull(cur.precipitation) != null
        ? roundInches(cur.precipitation as number)
        : null,
    windMph:
      numOrNull(cur.wind_speed_10m) != null
        ? round1(cur.wind_speed_10m as number)
        : null,
    windGustMph:
      numOrNull(cur.wind_gusts_10m) != null
        ? round1(cur.wind_gusts_10m as number)
        : null,
    weatherCode,
    summary: weatherCodeSummary(weatherCode),
  };

  const times = body.daily?.time ?? [];
  const daily: OpenMeteoDaily[] = [];
  for (let i = 0; i < times.length && daily.length < 7; i += 1) {
    const date = times[i];
    if (!date) continue;
    const code = body.daily?.weather_code?.[i];
    const tempMax = body.daily?.temperature_2m_max?.[i];
    const tempMin = body.daily?.temperature_2m_min?.[i];
    if (code == null || tempMax == null || tempMin == null) continue;
    const precip = body.daily?.precipitation_sum?.[i];
    const precipProb = body.daily?.precipitation_probability_max?.[i];
    const windMax = body.daily?.wind_speed_10m_max?.[i];
    const weatherCodeDay = Math.trunc(code);
    daily.push({
      date,
      tempMaxF: round1(tempMax),
      tempMinF: round1(tempMin),
      precipInches: roundInches(
        typeof precip === "number" && Number.isFinite(precip) ? precip : 0,
      ),
      precipProbabilityPct: numOrNull(precipProb),
      windMphMax:
        numOrNull(windMax) != null ? round1(windMax as number) : null,
      weatherCode: weatherCodeDay,
      summary: weatherCodeSummary(weatherCodeDay),
    });
  }

  if (daily.length === 0) {
    throw new Error("Open-Meteo forecast missing daily outlook");
  }

  return { current, daily, provider: "open-meteo" };
}

/**
 * Recent daily history from Open-Meteo archive (precip / temps / wind).
 * `dayCount` defaults to 14 (inclusive of yesterday; archive lags ~1–2 days).
 */
export async function fetchWeatherHistoryDays(
  point: GeoPoint,
  timeZone: string,
  dayCount: number = 14,
): Promise<OpenMeteoHistoryDay[]> {
  const end = new Date();
  // Archive often lags; end at yesterday local-ish UTC date
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (Math.max(1, dayCount) - 1));

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const url = new URL(ARCHIVE_URL);
  url.searchParams.set("latitude", String(point.lat));
  url.searchParams.set("longitude", String(point.lng));
  url.searchParams.set(
    "daily",
    [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "wind_speed_10m_max",
    ].join(","),
  );
  url.searchParams.set("start_date", startStr);
  url.searchParams.set("end_date", endStr);
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", timeZone);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo archive failed (${response.status})`);
  }

  const body = (await response.json()) as ArchiveResponse;
  const times = body.daily?.time ?? [];
  const days: OpenMeteoHistoryDay[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const date = times[i];
    if (!date) continue;
    const precip = body.daily?.precipitation_sum?.[i];
    const tempMax = body.daily?.temperature_2m_max?.[i];
    const tempMin = body.daily?.temperature_2m_min?.[i];
    const windMax = body.daily?.wind_speed_10m_max?.[i];
    days.push({
      date,
      precipInches: roundInches(
        typeof precip === "number" && Number.isFinite(precip) ? precip : 0,
      ),
      tempMaxF: numOrNull(tempMax) != null ? round1(tempMax as number) : null,
      tempMinF: numOrNull(tempMin) != null ? round1(tempMin as number) : null,
      windMphMax:
        numOrNull(windMax) != null ? round1(windMax as number) : null,
    });
  }

  return days;
}

async function geocodeViaOpenMeteo(address: string): Promise<GeoPoint | null> {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("name", address);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");

  const response = await fetch(url);
  if (!response.ok) return null;
  const body = (await response.json()) as OpenMeteoGeocodeResponse;
  const hit = body.results?.[0];
  if (!hit) return null;
  return { lat: hit.latitude, lng: hit.longitude };
}

async function geocodeViaNominatim(address: string): Promise<GeoPoint | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as NominatimResult;
  const hit = body[0];
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Resolve coordinates from a stored vineyard address (no hard-coded place). */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const fromOpenMeteo = await geocodeViaOpenMeteo(trimmed);
  if (fromOpenMeteo) return fromOpenMeteo;

  return geocodeViaNominatim(trimmed);
}
