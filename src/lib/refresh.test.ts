import { describe, expect, it } from 'vitest';
import {
  FAILED_REFRESH_RETRY_MS,
  LIVE_REFRESH_MS,
  LIVE_REFRESH_TICK_MS,
  isLatestRequest,
  liveRefreshDue,
  liveRefreshOrRetryDue,
} from './refresh';

describe('live refresh cadence', () => {
  it('uses an exact ten-minute interval', () => {
    expect(LIVE_REFRESH_MS).toBe(600_000);
    expect(liveRefreshDue(1_000, 600_999)).toBe(false);
    expect(liveRefreshDue(1_000, 601_000)).toBe(true);
  });

  it('checks the clock frequently enough for the ten-minute filter to age out', () => {
    expect(LIVE_REFRESH_TICK_MS).toBe(30_000);
  });

  it('retries a failed request after thirty seconds without moving the success clock', () => {
    const lastSuccess = 1_000;
    const failedAttempt = 601_000;

    expect(FAILED_REFRESH_RETRY_MS).toBe(30_000);
    expect(liveRefreshOrRetryDue(lastSuccess, failedAttempt, 630_999)).toBe(false);
    expect(liveRefreshOrRetryDue(lastSuccess, failedAttempt, 631_000)).toBe(true);
  });

  it('keeps the ten-minute cadence after a successful request', () => {
    expect(liveRefreshOrRetryDue(601_000, 601_000, 1_200_999)).toBe(false);
    expect(liveRefreshOrRetryDue(601_000, 601_000, 1_201_000)).toBe(true);
  });

  it('accepts only the newest request generation', () => {
    expect(isLatestRequest(4, 5)).toBe(false);
    expect(isLatestRequest(5, 5)).toBe(true);
  });
});
