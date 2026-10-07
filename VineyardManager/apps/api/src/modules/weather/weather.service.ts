import { calendarDateInZone } from "@vineyard/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../middleware/error-handler.js";
import { serializeActivity } from "../../lib/serialize.js";
import {
  fetchPast24hPrecipitationInches,
  geocodeAddress,
  type GeoPoint,
} from "./open-meteo.client.js";

export const RAIN_THRESHOLD_INCHES = 0.5;

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

async function resolveVineyardPoint(vineyard: {
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
