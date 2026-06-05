import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/**/src/**/*.spec.ts', 'libs/**/src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/api/src/__tests__/regression/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
      include: [
        'apps/api/src/modules/auth/auth.service.ts',
        'apps/api/src/modules/auth/token.service.ts',
        'apps/api/src/modules/auth/password.service.ts',
        'apps/api/src/modules/auth/guards/jwt-auth.guard.ts',
        'apps/api/src/modules/auth/guards/permissions.guard.ts',
        'apps/api/src/modules/auth/interceptors/audit.interceptor.ts',
        'apps/api/src/modules/leave/services/leave-accrual.engine.ts',
        'apps/api/src/modules/leave/services/leave-request.service.ts',
        'apps/api/src/modules/attendance/services/attendance.service.ts',
        'libs/prisma/src/extensions/tenant-scope.extension.ts',
      ],
      exclude: [
        '**/*.spec.ts',
        '**/*.module.ts',
        '**/main.ts',
        '**/index.ts',
        '**/*.dto.ts',
        '**/*.entity.ts',
        '**/*.interface.ts',
        '**/*bootstrap.ts',
        '**/response.types.ts',
        '**/api-error-responses.decorator.ts',
        '**/all-exceptions.filter.ts',
        '**/otel.ts',
        '**/span.decorator.ts',
      ],
    },
  },
});
