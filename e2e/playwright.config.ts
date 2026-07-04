import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/smoke',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'api-smoke',
      testMatch: '**/*.spec.ts',
    },
  ],
});
