import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { applyStrictTestEnv } from '../test-env';

describe('health integration', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    applyStrictTestEnv();
    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v1', { exclude: ['/health'] });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns expected shape', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    const body: { data: { status: string; timestamp: string } } = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toEqual({
      data: {
        status: 'ok',
        timestamp: expect.any(String),
      },
    });

    expect(Number.isNaN(Date.parse(body.data.timestamp))).toBe(false);
  });
});
