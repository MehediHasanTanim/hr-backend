import crypto from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { AppConfigService } from '../config/config.service';

export function buildPinoOptions(config: AppConfigService): Params {
  const isDev = config.get('app').nodeEnv !== 'production';

  return {
    pinoHttp: {
      level: config.get('log').level,
      autoLogging: {
        ignore: (req) => req.url === '/health',
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-api-key"]',
          'req.body.password',
          'req.body.secret',
        ],
        censor: '[REDACTED]',
      },
      customProps: (req: { headers: Record<string, string | string[] | undefined> }) => {
        const traceHeader = req.headers['x-trace-id'] ?? req.headers['x-b3-traceid'];
        const traceId = Array.isArray(traceHeader) ? traceHeader[0] : traceHeader;

        return {
          traceId: traceId ?? crypto.randomUUID(),
        };
      },
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          userAgent: req.headers?.['user-agent'],
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
      transport: isDev
        ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        }
        : undefined,
    },
  };
}
