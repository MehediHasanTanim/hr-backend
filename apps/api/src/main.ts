import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module';
import { bootstrapSwagger } from './swagger/swagger.bootstrap';
import { bootstrapPipes } from './pipes/pipes.bootstrap';
import { bootstrapFilters } from './filters/filters.bootstrap';
import { bootstrapInterceptors } from './interceptors/interceptors.bootstrap';
import { AppConfigService } from './config/config.service';
import { registerSecurityHeaders } from './security/security-headers';
import { PARSER_BODY_LIMIT_BYTES, registerRequestBodyLimit } from './security/request-body-limit';

export async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    logger: false,
    trustProxy: true,
    bodyLimit: PARSER_BODY_LIMIT_BYTES,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bufferLogs: true },
  );

  const config = app.get(AppConfigService);
  await app.register(fastifyCookie, {
    secret: config.get('cookie').secret,
  });

  const allowedOrigins = config.get('app').corsOrigin ?? [];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-trace-id',
      'x-api-key',
      'x-requested-with',
    ],
    exposedHeaders: ['x-trace-id', 'x-total-count'],
    maxAge: 86_400,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  app.setGlobalPrefix('api/v1', { exclude: ['/health'] });
  registerRequestBodyLimit(app);
  registerSecurityHeaders(app);

  bootstrapFilters(app);
  bootstrapPipes(app);
  bootstrapInterceptors(app);
  await bootstrapSwagger(app);

  const port = config.get('app').port;
  const host = config.get('app').host;

  await app.listen(port, host);
}

if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
  void bootstrap().catch((err: unknown) => {
    console.error('Fatal startup error', err);
    process.exit(1);
  });
}
