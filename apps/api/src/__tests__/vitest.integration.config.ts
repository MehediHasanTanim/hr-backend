import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/regression/**/*.spec.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    sequence: { concurrent: false },
    reporters: ['verbose', 'html'],
    outputFile: { html: './coverage/regression-report.html' },
    env: {
      NODE_ENV: 'test',
      VITEST_REGRESSION: 'true',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://hr_user:hr_secret@localhost:5434/hr_test',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://:redis_secret@localhost:6380/1',
      JWT_PRIVATE_KEY_PATH: process.env.JWT_PRIVATE_KEY_PATH ?? '../../keys/private.pem',
      JWT_PUBLIC_KEY_PATH: process.env.JWT_PUBLIC_KEY_PATH ?? '../../keys/public.pem',
      COOKIE_SECRET: process.env.COOKIE_SECRET ?? 'test-cookie-secret-with-at-least-32-characters',
      MAIL_HOST: process.env.MAIL_HOST ?? 'localhost',
      MAIL_PORT: process.env.MAIL_PORT ?? '1025',
      MAIL_FROM: process.env.MAIL_FROM ?? 'noreply@test.hr',
      MINIO_ENDPOINT: process.env.MINIO_ENDPOINT ?? 'localhost',
      MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY ?? 'test',
      MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY ?? 'test-secret',
      LOG_LEVEL: 'error',
      SWAGGER_ENABLED: 'false',
    },
  },
});
