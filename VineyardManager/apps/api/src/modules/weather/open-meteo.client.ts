/**
 * Open-Meteo forecast + geocoding helpers.
 * Location always comes from the vineyard record (lat/lng, else address).
 */

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
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

type ForecastResponse = {
  hourly?: {
    time?: Array<string | number>;
    precipitation?: Array<number | null>;
  };
};

type OpenMeteoGeocodeResponse = {
  results?: Array<{ latitude: number; longitude: number; name?: string }>;
};

type NominatimResult = Array<{ lat: string; lon: string }>;

function roundInches(value: number): number {
  return Math.round(value * 1000) / 1000;
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
