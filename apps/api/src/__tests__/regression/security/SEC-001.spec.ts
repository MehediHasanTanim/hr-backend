import { describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { countRows } from '../../helpers/db.helper';
import { bearer, loginAs } from '../../helpers/auth.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('sec-001');

describe('SEC-001 - SQL injection prevention', () => {
  it('does not execute injection strings from query params or JSON bodies', async () => {
    const seed = suite.getSeed();
    const adminToken = (await loginAs(getRequest(), seed.adminEmail)).accessToken;
    const search = await getRequest()
      .get("/api/v1/employees?search='; DROP TABLE employees; --")
      .set('Authorization', bearer(adminToken));
    expect([200, 400]).toContain(search.status);
    expect(await countRows('employees')).toBeGreaterThan(0);

    const hrToken = (await loginAs(getRequest(), seed.hrEmail)).accessToken;
    await getRequest()
      .post('/api/v1/employees')
      .set('Authorization', bearer(hrToken))
      .send({
        firstName: "Robert'); DROP TABLE employees; --",
        lastName: 'Tables',
        workEmail: 'bobby@test.hr',
        joinedAt: '2024-01-01',
        employmentType: 'FULL_TIME',
      })
      .expect(201);

    expect(await countRows('employees')).toBeGreaterThan(0);
  });
});
