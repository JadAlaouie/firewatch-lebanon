import { describe, expect, it, vi } from 'vitest';
import { coalesce, detectionCacheTtl, getFresh, setBounded } from './cache.mjs';

describe('bounded provider caching', () => {
  it('expires stale entries and evicts the least recently used key', () => {
    const cache = new Map();
    setBounded(cache, 'a', 1, 2, 100);
    setBounded(cache, 'b', 2, 2, 110);
    expect(getFresh(cache, 'a', 100, 120)).toBe(1);
    setBounded(cache, 'c', 3, 2, 130);
    expect(cache.has('b')).toBe(false);
    expect(getFresh(cache, 'a', 10, 200)).toBeUndefined();

    setBounded(cache, 'short', 4, 2, 200, 15);
    expect(getFresh(cache, 'short', 1_000, 214)).toBe(4);
    expect(getFresh(cache, 'short', 1_000, 215)).toBeUndefined();
  });

  it('shares one upstream operation between simultaneous callers', async () => {
    const inFlight = new Map();
    const loader = vi.fn(async () => 42);
    const [first, second] = await Promise.all([
      coalesce(inFlight, 'same', loader),
      coalesce(inFlight, 'same', loader),
    ]);
    expect([first, second]).toEqual([42, 42]);
    expect(loader).toHaveBeenCalledOnce();
    expect(inFlight.size).toBe(0);
  });

  it('caps the canonical 10-minute response and index cache at one minute', () => {
    expect(detectionCacheTtl(10 / 60, 240_000)).toBe(60_000);
    expect(detectionCacheTtl(10 / 60, 240_000, 30_000)).toBe(30_000);
    expect(detectionCacheTtl(10 / 60, 240_000, 120_000)).toBe(60_000);
    expect(detectionCacheTtl(6, 240_000, 30_000)).toBe(240_000);
  });
});
