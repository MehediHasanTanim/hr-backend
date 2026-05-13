import { afterAll, beforeAll, beforeEach } from 'vitest';
import { startApp, stopApp } from './app.helper';
import { disconnectDb, truncateTables } from './db.helper';
import { disconnectRedis, flushTestRedis } from './redis.helper';
import { seedCompany, type SeedCompanyResult } from './seed.helper';

export const RESET_TABLES = [
  'audit_logs',
  'payslips',
  'pay_periods',
  'leave_types',
  'salary_components',
  'employee_roles',
  'roles',
  'permissions',
  'employees',
  'users',
  'companies',
];

export function setupRegressionSuite(slug: string): { getSeed: () => SeedCompanyResult } {
  let seed: SeedCompanyResult;

  beforeAll(async () => {
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
    await disconnectRedis();
    await disconnectDb();
  });

  beforeEach(async () => {
    await truncateTables(...RESET_TABLES);
    await flushTestRedis();
    seed = await seedCompany(slug);
  });

  return { getSeed: () => seed };
}
