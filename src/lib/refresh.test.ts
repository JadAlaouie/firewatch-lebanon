import { describe, expect, it } from 'vitest';
import { LIVE_REFRESH_MS, liveRefreshDue } from './refresh';

describe('live refresh cadence', () => {
  it('uses an exact ten-minute interval', () => {
    expect(LIVE_REFRESH_MS).toBe(600_000);
    expect(liveRefreshDue(1_000, 600_999)).toBe(false);
    expect(liveRefreshDue(1_000, 601_000)).toBe(true);
  });
});
