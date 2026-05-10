import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema';

const validEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'localhost',
  MINIO_ACCESS_KEY: 'access',
  MINIO_SECRET_KEY: 'secret',
  JWT_SECRET: '12345678901234567890123456789012',
};

describe('envSchema', () => {
  it('validates correct env', () => {
    const { error } = envSchema.validate(validEnv);
    expect(error).toBeUndefined();
  });

  it('fails when DATABASE_URL is missing', () => {
    const { error } = envSchema.validate({ ...validEnv, DATABASE_URL: undefined });
    expect(error?.message).toContain('DATABASE_URL');
  });

  it('fails when JWT_SECRET is missing', () => {
    const { error } = envSchema.validate({ ...validEnv, JWT_SECRET: undefined });
    expect(error?.message).toContain('JWT_SECRET');
  });

  it('fails when JWT_SECRET is too short', () => {
    const { error } = envSchema.validate({ ...validEnv, JWT_SECRET: 'short' });
    expect(error).toBeDefined();
  });

  it('defaults PORT to 3000', () => {
    const { value } = envSchema.validate(validEnv);
    expect(value.PORT).toBe(3000);
  });

  it('rejects unknown NODE_ENV', () => {
    const { error } = envSchema.validate({ ...validEnv, NODE_ENV: 'staging' });
    expect(error).toBeDefined();
  });

  it('rejects undeclared env vars', () => {
    const { error } = envSchema.validate({ ...validEnv, FOO_BAR: 'xyz' });
    expect(error).toBeDefined();
  });
});
