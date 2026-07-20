export type LoginProgress = 'submitting' | 'waking' | 'retrying';

export type LoginOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: 'invalid-credentials' | 'rate-limited' | 'not-configured' | 'temporarily-unavailable';
      retryAfterSeconds?: number;
    };

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface LoginOptions {
  fetcher?: FetchLike;
  maxAttempts?: number;
  onProgress?: (progress: LoginProgress) => void;
  retryDelaysMs?: number[];
  slowRequestMs?: number;
  timeoutMs?: number;
  wait?: (delayMs: number) => Promise<void>;
  now?: () => number;
}

const RETRYABLE_STATUS_CODES = new Set([408, 425, 502, 503, 504]);
const DEFAULT_RETRY_DELAYS_MS = [800, 1_600];
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_SLOW_REQUEST_MS = 2_000;

function waitFor(delayMs: number) {
  return new Promise<void>(resolve => globalThis.setTimeout(resolve, delayMs));
}

export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds));

  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(1, Math.ceil((retryAt - now) / 1_000));
}

async function requestLogin(
  username: string,
  password: string,
  fetcher: FetchLike,
  timeoutMs: number,
  slowRequestMs: number,
  onProgress?: (progress: LoginProgress) => void,
) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const slowRequest = globalThis.setTimeout(() => onProgress?.('waking'), slowRequestMs);

  try {
    return await fetcher('/api/auth/login', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      // Copy/paste commonly adds whitespace around a username. Passwords are
      // intentionally left untouched because spaces may be significant.
      body: JSON.stringify({ username: username.trim(), password }),
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
    globalThis.clearTimeout(slowRequest);
  }
}

async function isMissingConfiguration(response: Response) {
  if (response.status !== 503) return false;
  try {
    const payload = await response.clone().json() as { error?: unknown };
    return typeof payload.error === 'string' && /not configured/i.test(payload.error);
  } catch {
    return false;
  }
}

/**
 * Retries only network failures and proxy/service status codes. A 401 or 429
 * is returned immediately so a typo cannot be amplified into a rate limit.
 */
export async function loginWithRetry(
  username: string,
  password: string,
  options: LoginOptions = {},
): Promise<LoginOutcome> {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? retryDelaysMs.length + 1));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const slowRequestMs = options.slowRequestMs ?? DEFAULT_SLOW_REQUEST_MS;
  const wait = options.wait ?? waitFor;
  const now = options.now ?? Date.now;

  options.onProgress?.('submitting');

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await requestLogin(
        username,
        password,
        fetcher,
        timeoutMs,
        slowRequestMs,
        options.onProgress,
      );
    } catch {
      if (attempt + 1 >= maxAttempts) {
        return { ok: false, reason: 'temporarily-unavailable' };
      }
      options.onProgress?.('retrying');
      await wait(retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)] ?? 0);
      continue;
    }

    if (response.ok) {
      try {
        const payload = await response.json() as { authenticated?: unknown };
        if (payload.authenticated === true) return { ok: true };
      } catch {
        // A successful login endpoint always returns JSON. Treat an invalid
        // proxy response as transient rather than accepting a false success.
      }
    } else if (response.status === 401) {
      return { ok: false, reason: 'invalid-credentials' };
    } else if (response.status === 429) {
      return {
        ok: false,
        reason: 'rate-limited',
        retryAfterSeconds: retryAfterSeconds(response.headers.get('retry-after'), now()),
      };
    } else if (await isMissingConfiguration(response)) {
      return { ok: false, reason: 'not-configured' };
    }

    if ((!response.ok && !RETRYABLE_STATUS_CODES.has(response.status)) || attempt + 1 >= maxAttempts) {
      return { ok: false, reason: 'temporarily-unavailable' };
    }

    options.onProgress?.('retrying');
    await wait(retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)] ?? 0);
  }

  return { ok: false, reason: 'temporarily-unavailable' };
}
