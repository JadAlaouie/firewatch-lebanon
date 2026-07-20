import { describe, expect, it, vi } from 'vitest';
import { loginWithRetry, retryAfterSeconds, type LoginProgress } from './login';

function jsonResponse(body: object, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const noWait = () => Promise.resolve();

describe('loginWithRetry', () => {
  it('returns immediately for invalid credentials without retrying', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: 'Invalid username or password.' }, 401));

    const outcome = await loginWithRetry('operator', 'wrong', {
      fetcher,
      maxAttempts: 3,
      slowRequestMs: 60_000,
      wait: noWait,
    });

    expect(outcome).toEqual({ ok: false, reason: 'invalid-credentials' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reports a rate limit and preserves the retry-after duration', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(
      { error: 'Too many sign-in attempts.' },
      429,
      { 'retry-after': '91' },
    ));

    const outcome = await loginWithRetry('operator', 'correct', {
      fetcher,
      slowRequestMs: 60_000,
    });

    expect(outcome).toEqual({ ok: false, reason: 'rate-limited', retryAfterSeconds: 91 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries transient Render responses and then signs in', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true }));
    const progress: LoginProgress[] = [];

    const outcome = await loginWithRetry('  operator  ', ' correct ', {
      fetcher,
      maxAttempts: 3,
      onProgress: value => progress.push(value),
      slowRequestMs: 60_000,
      wait: noWait,
    });

    expect(outcome).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(progress).toEqual(['submitting', 'retrying']);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      cache: 'no-store',
      credentials: 'same-origin',
      method: 'POST',
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      username: 'operator',
      password: ' correct ',
    });
  });

  it('retries a network interruption but not a configuration error', async () => {
    const recoveringFetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError('network interrupted'))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true }));

    await expect(loginWithRetry('operator', 'correct', {
      fetcher: recoveringFetcher,
      maxAttempts: 2,
      slowRequestMs: 60_000,
      wait: noWait,
    })).resolves.toEqual({ ok: true });

    const missingConfigFetcher = vi.fn().mockResolvedValue(jsonResponse(
      { error: 'Login is not configured on the server.' },
      503,
    ));

    await expect(loginWithRetry('operator', 'correct', {
      fetcher: missingConfigFetcher,
      slowRequestMs: 60_000,
      wait: noWait,
    })).resolves.toEqual({ ok: false, reason: 'not-configured' });
    expect(missingConfigFetcher).toHaveBeenCalledTimes(1);
  });
});

describe('retryAfterSeconds', () => {
  it('supports seconds and HTTP-date headers', () => {
    const now = Date.parse('2026-07-20T08:00:00Z');
    expect(retryAfterSeconds('45', now)).toBe(45);
    expect(retryAfterSeconds('Mon, 20 Jul 2026 08:02:00 GMT', now)).toBe(120);
    expect(retryAfterSeconds('invalid', now)).toBeUndefined();
  });
});
