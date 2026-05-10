export function applyTestEnv(overrides: Record<string, string> = {}): void {
  const base: Record<string, string> = {
    NODE_ENV: 'test',
    PORT: '3000',
    HOST: 'localhost',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    MINIO_ENDPOINT: 'localhost',
    MINIO_ACCESS_KEY: 'access',
    MINIO_SECRET_KEY: 'secret',
    JWT_SECRET: '12345678901234567890123456789012',
    LOG_LEVEL: 'info',
  };

  Object.entries({ ...base, ...overrides }).forEach(([key, value]) => {
    process.env[key] = value;
  });
}

export function applyStrictTestEnv(overrides: Record<string, string> = {}): void {
  Object.keys(process.env).forEach((key) => {
    delete process.env[key];
  });

  applyTestEnv(overrides);
}
