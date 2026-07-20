export const LIVE_REFRESH_MINUTES = 10;
export const LIVE_REFRESH_MS = LIVE_REFRESH_MINUTES * 60 * 1000;
export const LIVE_REFRESH_TICK_MS = 30 * 1000;
export const FAILED_REFRESH_RETRY_MS = 30 * 1000;

export function liveRefreshDue(lastRefreshAt: number, now = Date.now()) {
  return now - lastRefreshAt >= LIVE_REFRESH_MS;
}

/**
 * Failed live requests should be retried promptly, while successful requests
 * keep the normal ten-minute upstream cadence. An attempt newer than the last
 * success represents a failure (or an interrupted request).
 */
export function liveRefreshOrRetryDue(
  lastSuccessfulRefreshAt: number,
  lastAttemptAt: number,
  now = Date.now(),
) {
  if (lastAttemptAt > lastSuccessfulRefreshAt) {
    return now - lastAttemptAt >= FAILED_REFRESH_RETRY_MS;
  }
  return liveRefreshDue(lastSuccessfulRefreshAt, now);
}

export function isLatestRequest(requestId: number, latestRequestId: number) {
  return requestId === latestRequestId;
}
