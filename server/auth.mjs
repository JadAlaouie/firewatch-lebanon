import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'firewatch_session';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;

export function parseCookies(header = '') {
  return String(header).split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return cookies;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
    return cookies;
  }, {});
}

export function credentialsMatch(candidateUser, candidatePassword, expectedUser, expectedPassword) {
  const digest = value => createHash('sha256').update(String(value ?? ''), 'utf8').digest();
  return timingSafeEqual(digest(candidateUser), digest(expectedUser))
    && timingSafeEqual(digest(candidatePassword), digest(expectedPassword));
}

function isSecureRequest(request) {
  return request.secure || String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function sessionCookie(token, maxAgeSeconds, secure) {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

export function createAuth({ username, password, sessionHours = 12, now = () => Date.now() }) {
  const sessions = new Map();
  const failedLogins = new Map();
  const sessionMs = Math.max(1, sessionHours) * 3600000;
  const configured = Boolean(username && password);

  function noStore(response) {
    response.setHeader('Cache-Control', 'no-store');
  }

  function requestKey(request) {
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }

  function currentSession(request) {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const session = sessions.get(token);
    if (!session || session.expiresAt <= now()) {
      sessions.delete(token);
      return null;
    }
    return { token, ...session };
  }

  function status(request, response) {
    noStore(response);
    response.json({ authenticated: Boolean(currentSession(request)), configured });
  }

  function login(request, response) {
    noStore(response);
    if (!configured) return response.status(503).json({ error: 'Login is not configured on the server.' });

    const key = requestKey(request);
    const failure = failedLogins.get(key);
    if (failure && failure.resetAt > now() && failure.count >= MAX_LOGIN_FAILURES) {
      const retrySeconds = Math.max(1, Math.ceil((failure.resetAt - now()) / 1000));
      response.setHeader('Retry-After', String(retrySeconds));
      return response.status(429).json({ error: 'Too many sign-in attempts. Try again later.' });
    }
    if (failure?.resetAt <= now()) failedLogins.delete(key);

    if (!credentialsMatch(request.body?.username, request.body?.password, username, password)) {
      const current = failedLogins.get(key);
      failedLogins.set(key, {
        count: (current?.count || 0) + 1,
        resetAt: current?.resetAt > now() ? current.resetAt : now() + LOGIN_WINDOW_MS,
      });
      return response.status(401).json({ error: 'Invalid username or password.' });
    }

    failedLogins.delete(key);
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, { expiresAt: now() + sessionMs });
    response.setHeader('Set-Cookie', sessionCookie(token, Math.round(sessionMs / 1000), isSecureRequest(request)));
    return response.json({ authenticated: true });
  }

  function logout(request, response) {
    noStore(response);
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (token) sessions.delete(token);
    response.setHeader('Set-Cookie', sessionCookie('', 0, isSecureRequest(request)));
    return response.json({ authenticated: false });
  }

  function requireAuth(request, response, next) {
    noStore(response);
    if (!currentSession(request)) return response.status(401).json({ error: 'Authentication required.' });
    return next();
  }

  return { configured, login, logout, requireAuth, status };
}
