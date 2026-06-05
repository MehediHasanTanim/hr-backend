import crypto from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { AppConfigService } from '../config/config.service';

export function buildPinoOptions(config: AppConfigService): Params {
  const isDev = config.get('app').nodeEnv !== 'production';
  const logConfig = config.get('log');
  const pinoHttpOptions = {
    level: logConfig.level,
    autoLogging: {
      ignore: (req: { url?: string }) => req.url === '/health',
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
      req: (req: { method?: string; url?: string; headers?: Record<string, string | string[] | undefined> }) => ({
        method: req.method,
        url: req.url,
        userAgent: req.headers?.['user-agent'],
      }),
      res: (res: { statusCode?: number }) => ({
        statusCode: res.statusCode,
      }),
    },
  };

  if (logConfig.fileEnabled) {
    return {
      pinoHttp: {
        ...pinoHttpOptions,
        transport: {
          targets: [
            isDev
              ? {
                target: 'pino-pretty',
                level: logConfig.level,
                options: { colorize: true, translateTime: 'HH:MM:ss' },
              }
              : {
                target: 'pino/file',
                level: logConfig.level,
                options: { destination: 1 },
              },
            {
              target: 'pino/file',
              level: logConfig.fileLevel ?? logConfig.level,
              options: {
                destination: logConfig.filePath,
                mkdir: true,
              },
            },
          ],
        },
      },
    };
  }

  return {
    pinoHttp: {
      ...pinoHttpOptions,
      transport: isDev
        ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        }
        : undefined,
    },
  };
}
