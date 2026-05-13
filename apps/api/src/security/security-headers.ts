import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export function registerSecurityHeaders(app: NestFastifyApplication): void {
  app.getHttpAdapter().getInstance().addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    reply.header('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'");
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.removeHeader('X-Powered-By');
    return payload;
  });
}
