import { beforeEach, describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { getRow, rowExists, truncateTables } from '../../helpers/db.helper';
import { bearer, loginAs } from '../../helpers/auth.helper';
import { flushTestRedis } from '../../helpers/redis.helper';
import { RESET_TABLES, setupRegressionSuite } from '../../helpers/regression.helper';
import { seedCompany, type SeedCompanyResult } from '../../helpers/seed.helper';

setupRegressionSuite('mt-002-bootstrap');

let companyA: SeedCompanyResult;
let companyB: SeedCompanyResult;
let tokenA: string;

beforeEach(async () => {
  await truncateTables(...RESET_TABLES);
  await flushTestRedis();
  companyA = await seedCompany('mt-002-a');
  companyB = await seedCompany('mt-002-b');
  tokenA = (await loginAs(getRequest(), companyA.adminEmail)).accessToken;
});

describe('MT-002 - Cross-tenant writes are blocked', () => {
  it('returns 404 for cross-tenant read, patch, and delete and leaves the row unchanged', async () => {
    await getRequest().get(`/api/v1/employees/${companyB.empEmployeeId}`).set('Authorization', bearer(tokenA)).expect(404);
    const before = await getRow<{ workEmail: string; deletedAt: Date | null }>('employees', { id: companyB.empEmployeeId });

    await getRequest()
      .patch(`/api/v1/employees/${companyB.empEmployeeId}`)
      .set('Authorization', bearer(tokenA))
      .send({ workEmail: 'hacked@test.hr' })
      .expect(404);
    await getRequest()
      .delete(`/api/v1/employees/${companyB.empEmployeeId}`)
      .set('Authorization', bearer(tokenA))
      .expect(404);

    const after = await getRow<{ workEmail: string; deletedAt: Date | null }>('employees', { id: companyB.empEmployeeId });
    expect(after?.workEmail).toBe(before?.workEmail);
    expect(after?.deletedAt).toBeNull();
  });

  it('logs failed cross-tenant write attempts under Company A', async () => {
    await getRequest()
      .patch(`/api/v1/employees/${companyB.empEmployeeId}`)
      .set('Authorization', bearer(tokenA))
      .send({ workEmail: 'hacked@test.hr' });
    await new Promise((resolve) => { setTimeout(resolve, 150); });

    expect(await rowExists('audit_logs', {
      companyId: companyA.companyId,
      resourceId: companyB.empEmployeeId,
    })).toBe(true);
    expect(await rowExists('audit_logs', {
      companyId: companyB.companyId,
      resourceId: companyB.empEmployeeId,
    })).toBe(false);
  });
});
