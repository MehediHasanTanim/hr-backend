import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export const REQUEST_BODY_LIMIT_BYTES = 5 * 1024 * 1024;
export const PARSER_BODY_LIMIT_BYTES = 8 * 1024 * 1024;

export function registerRequestBodyLimit(app: NestFastifyApplication): void {
  app.getHttpAdapter().getInstance().addHook('preHandler', (request, reply, done) => {
    const contentLength = Number(request.headers['content-length'] ?? 0);

    if (contentLength > REQUEST_BODY_LIMIT_BYTES) {
      void reply.code(413).send({
        type: 'https://httpstatuses.com/413',
        title: 'PAYLOAD_TOO_LARGE',
        status: 413,
        detail: 'Request body exceeds the maximum allowed size',
        instance: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    done();
  });
}
