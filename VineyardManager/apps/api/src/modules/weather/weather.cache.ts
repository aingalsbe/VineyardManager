/**
 * Simple in-process TTL cache for weather read APIs.
 *
 * TTL (documented here + docs/api-outline.md):
 * - GET .../weather (current + 7-day + alerts): 15 minutes
 * - GET .../weather/history: 15 minutes
 */
export const WEATHER_FORECAST_CACHE_TTL_MS = 15 * 60 * 1000;
export const WEATHER_HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  fetchedAt: string;
};

const store = new Map<string, CacheEntry<unknown>>();

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
  const entry: CacheEntry<T> = {
    value,
    expiresAt: Date.now() + ttlMs,
    fetchedAt: new Date().toISOString(),
  };
  store.set(key, entry as CacheEntry<unknown>);
  return entry;
}

/** Test / ops helper — not wired to HTTP. */
export function cacheClear(): void {
  store.clear();
}
