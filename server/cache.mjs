export function getFresh(cache, key, maxAgeMs, now = Date.now()) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt != null ? now >= entry.expiresAt : now - entry.time >= maxAgeMs) {
    cache.delete(key);
    return undefined;
  }
  // Refresh insertion order so frequently used keys survive bounded eviction.
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

export function setBounded(cache, key, value, maxEntries, now = Date.now(), ttlMs) {
  cache.delete(key);
  cache.set(key, {
    time: now,
    value,
    ...(Number.isFinite(ttlMs) ? { expiresAt: now + Math.max(0, ttlMs) } : {}),
  });
  while (cache.size > maxEntries) {
    cache.delete(cache.keys().next().value);
  }
  return value;
}

export function coalesce(inFlight, key, loader) {
  const pending = inFlight.get(key);
  if (pending) return pending;
  const task = Promise.resolve()
    .then(loader)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}

const TEN_MINUTES_IN_HOURS = 10 / 60;
const MAX_SHORT_WINDOW_CACHE_MS = 60_000;

export function detectionCacheTtl(hours, configuredTtlMs, shortWindowTtlMs = MAX_SHORT_WINDOW_CACHE_MS) {
  const baseTtlMs = Number.isFinite(configuredTtlMs) && configuredTtlMs >= 0
    ? configuredTtlMs
    : 240_000;
  if (Math.abs(hours - TEN_MINUTES_IN_HOURS) >= 1e-6) return baseTtlMs;

  const requestedShortTtlMs = Number.isFinite(shortWindowTtlMs) && shortWindowTtlMs >= 0
    ? shortWindowTtlMs
    : MAX_SHORT_WINDOW_CACHE_MS;
  return Math.min(baseTtlMs, requestedShortTtlMs, MAX_SHORT_WINDOW_CACHE_MS);
}
