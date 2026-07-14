export const LIVE_REFRESH_MINUTES = 10;
export const LIVE_REFRESH_MS = LIVE_REFRESH_MINUTES * 60 * 1000;

export function liveRefreshDue(lastRefreshAt: number, now = Date.now()) {
  return now - lastRefreshAt >= LIVE_REFRESH_MS;
}
