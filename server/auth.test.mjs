import { describe, expect, it, vi } from 'vitest';
import { createAuth, credentialsMatch, parseCookies, SESSION_COOKIE } from './auth.mjs';

function responseMock() {
  return {
    body: undefined,
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('server authentication', () => {
  it('parses cookies and compares both credentials', () => {
    expect(parseCookies('theme=dark; firewatch_session=abc%20123')).toEqual({
      theme: 'dark',
      firewatch_session: 'abc 123',
    });
    expect(credentialsMatch('operator', 'correct', 'operator', 'correct')).toBe(true);
    expect(credentialsMatch('operator', 'wrong', 'operator', 'correct')).toBe(false);
  });

  it('creates an HttpOnly session and protects API handlers', () => {
    let clock = 1_000_000;
    const auth = createAuth({
      username: 'operator',
      password: 'correct',
      sessionHours: 1,
      now: () => clock,
    });
    const loginResponse = responseMock();
    auth.login({ body: { username: 'operator', password: 'correct' }, headers: {}, ip: 'test' }, loginResponse);

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.headers['Set-Cookie']).toContain('HttpOnly');
    expect(loginResponse.headers['Set-Cookie']).toContain('SameSite=Strict');
    const token = parseCookies(loginResponse.headers['Set-Cookie'])[SESSION_COOKIE];
    const next = vi.fn();
    const protectedResponse = responseMock();
    auth.requireAuth({ headers: { cookie: `${SESSION_COOKIE}=${token}` } }, protectedResponse, next);
    expect(next).toHaveBeenCalledOnce();

    clock += 3600001;
    const expiredResponse = responseMock();
    auth.requireAuth({ headers: { cookie: `${SESSION_COOKIE}=${token}` } }, expiredResponse, next);
    expect(expiredResponse.statusCode).toBe(401);
  });

  it('rejects invalid credentials without creating a cookie', () => {
    const auth = createAuth({ username: 'operator', password: 'correct' });
    const response = responseMock();
    auth.login({ body: { username: 'operator', password: 'wrong' }, headers: {}, ip: 'test' }, response);
    expect(response.statusCode).toBe(401);
    expect(response.headers['Set-Cookie']).toBeUndefined();
  });

  it('always accepts correct credentials while invalid attempts remain throttled', () => {
    const auth = createAuth({ username: 'operator', password: 'correct' });
    const login = password => {
      const response = responseMock();
      auth.login({ body: { username: 'operator', password }, headers: {}, ip: 'shared-proxy' }, response);
      return response;
    };

    expect(Array.from({ length: 5 }, () => login('wrong').statusCode))
      .toEqual([401, 401, 401, 401, 401]);
    expect(login('still-wrong').statusCode).toBe(429);

    const correct = login('correct');
    expect(correct.statusCode).toBe(200);
    expect(correct.body).toEqual({ authenticated: true });
    expect(correct.headers['Set-Cookie']).toContain(`${SESSION_COOKIE}=`);

    // A successful login clears this address's failed-attempt window.
    expect(login('wrong-again').statusCode).toBe(401);
  });

  it('bounds failed-login tracking across distinct client addresses', () => {
    const auth = createAuth({
      username: 'operator',
      password: 'correct',
      maxTrackedFailures: 2,
    });
    const attempt = ip => {
      const response = responseMock();
      auth.login({ body: { username: 'operator', password: 'wrong' }, headers: {}, ip }, response);
      return response.statusCode;
    };

    expect(Array.from({ length: 5 }, () => attempt('first'))).toEqual([401, 401, 401, 401, 401]);
    expect(attempt('second')).toBe(401);
    expect(attempt('third')).toBe(401);
    // The oldest distinct address was evicted instead of remaining globally
    // rate-limited forever in an unbounded map.
    expect(attempt('first')).toBe(401);
  });

  it('uses the sanitized client-first address behind multiple production proxies', () => {
    const auth = createAuth({
      username: 'operator',
      password: 'correct',
      trustForwardedFor: true,
    });
    const attempt = client => {
      const response = responseMock();
      auth.login({
        body: { username: 'operator', password: 'wrong' },
        headers: { 'x-forwarded-for': `${client}, 203.0.113.254` },
        ip: '203.0.113.254',
      }, response);
      return response.statusCode;
    };

    expect(Array.from({ length: 5 }, (_, index) => attempt(`198.51.100.${index + 1}`)))
      .toEqual([401, 401, 401, 401, 401]);
    expect(attempt('198.51.100.1')).toBe(401);
    expect(Array.from({ length: 5 }, () => attempt('198.51.100.9')))
      .toEqual([401, 401, 401, 401, 401]);
    expect(attempt('198.51.100.9')).toBe(429);
  });

  it('ignores spoofable forwarded addresses unless proxy trust is explicit', () => {
    const auth = createAuth({ username: 'operator', password: 'correct' });
    const attempt = forwarded => {
      const response = responseMock();
      auth.login({
        body: { username: 'operator', password: 'wrong' },
        headers: { 'x-forwarded-for': forwarded },
        ip: '203.0.113.10',
      }, response);
      return response.statusCode;
    };

    expect(Array.from({ length: 5 }, (_, index) => attempt(`198.51.100.${index + 1}`)))
      .toEqual([401, 401, 401, 401, 401]);
    expect(attempt('198.51.100.250')).toBe(429);
  });
});
