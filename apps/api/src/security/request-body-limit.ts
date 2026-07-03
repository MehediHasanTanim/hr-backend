import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/** Per-endpoint file upload limit (configurable via MAX_UPLOAD_BYTES env var, default 5 MB) */
export const MAX_UPLOAD_BYTES =
  parseInt(process.env.MAX_UPLOAD_BYTES ?? '5242880', 10);

/** Global Fastify body limit (configurable via BODY_LIMIT_BYTES env var, default 10 MB) */
export const PARSER_BODY_LIMIT_BYTES =
  parseInt(process.env.BODY_LIMIT_BYTES ?? '10485760', 10);

export function registerRequestBodyLimit(app: NestFastifyApplication): void {
  app.getHttpAdapter().getInstance().addHook('preHandler', (request, reply, done) => {
    const contentLength = Number(request.headers['content-length'] ?? 0);

    if (contentLength > PARSER_BODY_LIMIT_BYTES) {
      void reply.code(413).send({
        type: 'https://httpstatuses.com/413',
        title: 'PAYLOAD_TOO_LARGE',
        status: 413,
        detail: `Request body exceeds the maximum allowed size of ${PARSER_BODY_LIMIT_BYTES} bytes`,
        instance: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    done();
  });
}
