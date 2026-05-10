import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyStrictTestEnv } from './test-env';

const createMock = vi.fn();

vi.mock('@nestjs/core', () => ({
  NestFactory: {
    create: createMock,
  },
}));

vi.mock('./swagger/swagger.bootstrap', () => ({ bootstrapSwagger: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./pipes/pipes.bootstrap', () => ({ bootstrapPipes: vi.fn() }));
vi.mock('./filters/filters.bootstrap', () => ({ bootstrapFilters: vi.fn() }));
vi.mock('./interceptors/interceptors.bootstrap', () => ({ bootstrapInterceptors: vi.fn() }));

describe('main bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyStrictTestEnv();
    process.env.PORT = '4500';
    process.env.HOST = '127.0.0.1';
  });

  it('calls listen with configured port and host', async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const app = {
      enableCors: vi.fn(),
      setGlobalPrefix: vi.fn(),
      listen,
    } as unknown as NestFastifyApplication;

    createMock.mockResolvedValue(app);

    const { bootstrap } = await import('./main');
    await bootstrap();

    expect(listen).toHaveBeenCalledWith(4500, '127.0.0.1');
  });
});
