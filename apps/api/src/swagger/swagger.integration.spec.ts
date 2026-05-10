import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootstrapSwagger } from './swagger.bootstrap';
import { applyStrictTestEnv } from '../test-env';

describe('swagger integration', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    applyStrictTestEnv({ NODE_ENV: 'development' });
    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await bootstrapSwagger(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/docs-json returns openapi document', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/docs-json' });
    const body: Record<string, unknown> = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        openapi: expect.any(String),
        info: expect.any(Object),
        paths: expect.any(Object),
      }),
    );
  });
});
