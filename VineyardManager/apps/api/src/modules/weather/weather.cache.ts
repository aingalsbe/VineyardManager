/**
 * Simple in-process TTL cache for weather read APIs.
 *
 * TTL (documented here + docs/api-outline.md):
 * - GET .../weather (current + 7-day + alerts): 15 minutes
 * - GET .../weather/history: 15 minutes
 */
export const WEATHER_FORECAST_CACHE_TTL_MS = 15 * 60 * 1000;
export const WEATHER_HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;

const MAX_CACHE_ENTRIES = 200;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  fetchedAt: string;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function cacheGet<T>(key: string): CacheEntry<T> | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit as CacheEntry<T>;
}

export function cacheSet<T>(
  key: string,
  value: T,
  ttlMs: number,
): CacheEntry<T> {
  if (store.size >= MAX_CACHE_ENTRIES && !store.has(key)) {
    const now = Date.now();
    for (const [k, v] of store) {
      if (now >= v.expiresAt) store.delete(k);
    }
    if (store.size >= MAX_CACHE_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
  }
  const entry: CacheEntry<T> = {
    value,
    expiresAt: Date.now() + ttlMs,
    fetchedAt: new Date().toISOString(),
  };
  store.set(key, entry as CacheEntry<unknown>);
  return entry;
}

/** Deduplicate concurrent fetches for the same cache key (prevents cache stampede). */
export function runSingleFlight<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = loader().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/** Drop all cached forecast & history entries for a vineyard (e.g. after address/timezone edit). */
export function invalidateVineyardWeather(vineyardId: string): void {
  const forecastPrefix = `weather:forecast:${vineyardId}`;
  const historyPrefix = `weather:history:${vineyardId}:`;
  for (const key of store.keys()) {
    if (key === forecastPrefix || key.startsWith(historyPrefix)) {
      store.delete(key);
    }
  }
}

/** Test / ops helper — not wired to HTTP. */
export function cacheClear(): void {
  store.clear();
  inflight.clear();
}
