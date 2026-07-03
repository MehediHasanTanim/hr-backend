import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * Register security headers on every response.
 *
 * This is a pure REST API server — no HTML is served from this origin.
 * CSP headers are included as a defence-in-depth measure.
 *
 * | Directive           | Value                         | Reason                            |
 * |---------------------|-------------------------------|-----------------------------------|
 * | default-src         | 'self'                        | Deny all unlisted resource types  |
 * | script-src          | 'self'                        | No external scripts ever served   |
 * | style-src           | 'self' 'unsafe-inline'        | Required for Swagger UI           |
 * | img-src             | 'self' data: https:           | Swagger UI loads badge images     |
 * | connect-src         | 'self'                        | XHR/fetch limited to same origin  |
 * | object-src          | 'none'                        | Deny Flash/plugins                |
 * | frame-src           | 'none'                        | No iframes served                 |
 * | frame-ancestors     | 'none'                        | Prevent clickjacking              |
 */
export function registerSecurityHeaders(app: NestFastifyApplication): void {
  app.getHttpAdapter().getInstance().addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    reply.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "object-src 'none'",
        "frame-src 'none'",
        "font-src 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.removeHeader('X-Powered-By');
    return payload;
  });
}
