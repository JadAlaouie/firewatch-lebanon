import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeDemoDetections } from './demo.mjs';

describe('demonstration detections', () => {
  afterEach(() => vi.useRealTimers());

  it('provides a clearly marked point inside the 10-minute fallback window', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-20T12:04:59.000Z');

    const detections = makeDemoDetections(10 / 60);

    expect(detections).toHaveLength(1);
    expect(detections[0].demo).toBe(true);
    expect(Date.now() - Date.parse(detections[0].timestamp)).toBeLessThan(10 * 60_000);
  });
});
