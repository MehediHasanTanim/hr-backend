import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bootstrapSwagger } from './swagger.bootstrap';

const swaggerMocks = vi.hoisted(() => ({
  createDocument: vi.fn(() => ({ openapi: '3.1.0', info: {}, paths: {} })),
  setup: vi.fn(),
}));

vi.mock('@nestjs/swagger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/swagger')>();
  return {
    ...actual,
    SwaggerModule: {
      ...actual.SwaggerModule,
      createDocument: swaggerMocks.createDocument,
      setup: swaggerMocks.setup,
    },
  };
});

describe('bootstrapSwagger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.SWAGGER_ENABLED;
  });

  function makeApp() {
    const register = vi.fn().mockResolvedValue(undefined);
    const app = {
      getHttpAdapter: () => ({ getInstance: () => ({ register }) }),
    };

    return { app, register };
  }

  it('skips registration in production when disabled', async () => {
    process.env.NODE_ENV = 'production';
    const { app, register } = makeApp();

    await bootstrapSwagger(app as never);

    expect(register).not.toHaveBeenCalled();
  });

  it('registers in production when SWAGGER_ENABLED=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SWAGGER_ENABLED = 'true';

    const { app, register } = makeApp();

    await bootstrapSwagger(app as never);

    expect(register).toHaveBeenCalledTimes(1);
  });
});
