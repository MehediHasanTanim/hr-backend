import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['libs/shared/src/utils/**/*.spec.ts'],
    coverage: {
      thresholds: { lines: 95, functions: 95, branches: 95, statements: 95 },
    },
  },
});
