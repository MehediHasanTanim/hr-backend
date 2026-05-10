import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { bootstrapSwagger } from './swagger/swagger.bootstrap';
import { bootstrapPipes } from './pipes/pipes.bootstrap';
import { bootstrapFilters } from './filters/filters.bootstrap';
import { bootstrapInterceptors } from './interceptors/interceptors.bootstrap';

export async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    logger: false,
    trustProxy: true,
    bodyLimit: 10_485_760,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bufferLogs: true },
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    credentials: true,
  });

  app.setGlobalPrefix('api/v1', { exclude: ['/health'] });

  bootstrapFilters(app);
  bootstrapPipes(app);
  bootstrapInterceptors(app);
  await bootstrapSwagger(app);

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen(port, host);
}

if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
  void bootstrap().catch((err: unknown) => {
    console.error('Fatal startup error', err);
    process.exit(1);
  });
}
