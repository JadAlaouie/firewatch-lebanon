import { describe, expect, it, vi } from 'vitest';
import { REFERRER_POLICY, securityHeaders } from './security.mjs';

describe('server security headers', () => {
  it('keeps cross-origin map requests identifiable to tile providers', () => {
    const headers = {};
    const response = {
      setHeader(name, value) { headers[name] = value; },
    };
    const next = vi.fn();

    securityHeaders({}, response, next);

    expect(headers).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': REFERRER_POLICY,
      'X-Frame-Options': 'DENY',
    });
    expect(REFERRER_POLICY).toBe('strict-origin-when-cross-origin');
    expect(next).toHaveBeenCalledOnce();
  });
});
