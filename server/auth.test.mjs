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
});
