import { describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { countRows } from '../../helpers/db.helper';
import { bearer, loginAs } from '../../helpers/auth.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('sec-002');

describe('SEC-002 - Request body size limits', () => {
  it('rejects a 6MB JSON body without writing partial data', async () => {
    const seed = suite.getSeed();
    const token = (await loginAs(getRequest(), seed.hrEmail)).accessToken;
    const before = await countRows('employees', { companyId: seed.companyId });

    const res = await getRequest()
      .post('/api/v1/employees')
      .set('Authorization', bearer(token))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({
        firstName: 'Bloated',
        workEmail: 'bloated@test.hr',
        customFields: 'x'.repeat(6 * 1024 * 1024),
      }));

    expect(res.status).toBe(413);
    expect(await countRows('employees', { companyId: seed.companyId })).toBe(before);
  });

  it('accepts a normal JSON body', async () => {
    const seed = suite.getSeed();
    const token = (await loginAs(getRequest(), seed.hrEmail)).accessToken;
    await getRequest()
      .post('/api/v1/employees')
      .set('Authorization', bearer(token))
      .send({
        firstName: 'Valid',
        lastName: 'User',
        workEmail: 'valid@test.hr',
        joinedAt: '2024-01-01',
        employmentType: 'FULL_TIME',
      })
      .expect(201);
  });
});
