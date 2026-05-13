import { beforeEach, describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { rowExists, truncateTables } from '../../helpers/db.helper';
import { bearer, loginAs } from '../../helpers/auth.helper';
import { flushTestRedis } from '../../helpers/redis.helper';
import { RESET_TABLES, setupRegressionSuite } from '../../helpers/regression.helper';
import { seedCompany, type SeedCompanyResult } from '../../helpers/seed.helper';

setupRegressionSuite('auth-005-bootstrap');

let companyA: SeedCompanyResult;
let companyB: SeedCompanyResult;
let tokenA: string;

beforeEach(async () => {
  await truncateTables(...RESET_TABLES);
  await flushTestRedis();
  companyA = await seedCompany('auth-005-a');
  companyB = await seedCompany('auth-005-b');
  tokenA = (await loginAs(getRequest(), companyA.adminEmail)).accessToken;
});

describe('AUTH-005 - Cross-tenant data isolation', () => {
  it('hides Company B rows from Company A read and write attempts', async () => {
    await getRequest()
      .get(`/api/v1/employees/${companyB.empEmployeeId}`)
      .set('Authorization', bearer(tokenA))
      .expect(404);

    await getRequest()
      .patch(`/api/v1/employees/${companyB.empEmployeeId}`)
      .set('Authorization', bearer(tokenA))
      .send({ firstName: 'Hacked' })
      .expect(404);

    const res = await getRequest()
      .get('/api/v1/employees')
      .set('Authorization', bearer(tokenA))
      .expect(200);
    const returnedIds = res.body.data.map((employee: { id: string }) => employee.id);
    expect(returnedIds).not.toContain(companyB.empEmployeeId);
    expect(await rowExists('employees', { id: companyB.empEmployeeId })).toBe(true);
  });
});
