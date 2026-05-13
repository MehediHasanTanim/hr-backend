import { describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { countRows, truncateTables } from '../../helpers/db.helper';
import { bearer, loginAs } from '../../helpers/auth.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('aud-003');

describe('AUD-003 - Audit log writes are non-blocking', () => {
  it('returns before artificial audit latency completes', async () => {
    const token = (await loginAs(getRequest(), suite.getSeed().hrEmail)).accessToken;
    const start = Date.now();
    await getRequest()
      .post('/api/v1/employees')
      .set('Authorization', bearer(token))
      .set('x-test-audit-delay', '500')
      .send({ firstName: 'Async', lastName: 'Test', workEmail: 'async@test.hr', joinedAt: '2024-01-01', employmentType: 'FULL_TIME' })
      .expect(201);

    expect(Date.now() - start).toBeLessThan(300);
  });

  it('persists delayed audit entries and does not propagate audit failures', async () => {
    const token = (await loginAs(getRequest(), suite.getSeed().hrEmail)).accessToken;
    await truncateTables('audit_logs');
    await getRequest()
      .post('/api/v1/employees')
      .set('Authorization', bearer(token))
      .set('x-test-audit-delay', '300')
      .send({ firstName: 'Delayed', lastName: 'Audit', workEmail: 'delayed@test.hr', joinedAt: '2024-01-01', employmentType: 'FULL_TIME' })
      .expect(201);

    await new Promise((resolve) => { setTimeout(resolve, 650); });
    expect(await countRows('audit_logs')).toBeGreaterThan(0);

    const res = await getRequest()
      .post('/api/v1/employees')
      .set('Authorization', bearer(token))
      .set('x-test-audit-fail', 'true')
      .send({ firstName: 'Fail', lastName: 'Audit', workEmail: 'failaudit@test.hr', joinedAt: '2024-01-01', employmentType: 'FULL_TIME' });
    expect(res.status).toBe(201);
  });
});
