export const REFERRER_POLICY = 'strict-origin-when-cross-origin';

export function securityHeaders(_request, response, next) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', REFERRER_POLICY);
  response.setHeader('X-Frame-Options', 'DENY');
  next();
}
