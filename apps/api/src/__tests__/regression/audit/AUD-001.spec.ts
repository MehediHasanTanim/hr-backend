import { beforeEach, describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { countRows, getRow, query, rowExists, truncateTables } from '../../helpers/db.helper';
import { bearer, loginAs } from '../../helpers/auth.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('aud-001');

let hrToken: string;

beforeEach(async () => {
  hrToken = (await loginAs(getRequest(), suite.getSeed().hrEmail)).accessToken;
  await truncateTables('audit_logs');
});

describe('AUD-001 - Mutations generate audit log entries', () => {
  it('audits create and update operations but not reads', async () => {
    const create = await getRequest()
      .post('/api/v1/employees')
      .set('Authorization', bearer(hrToken))
      .send({ firstName: 'Alice', lastName: 'A', workEmail: 'alice@test.hr', joinedAt: '2024-01-01', employmentType: 'FULL_TIME' })
      .expect(201);
    await new Promise((resolve) => { setTimeout(resolve, 150); });

    const employeeId = create.body.data.id;
    expect(await rowExists('audit_logs', { action: 'employees.create', resourceId: employeeId })).toBe(true);

    await truncateTables('audit_logs');
    await getRequest()
      .patch(`/api/v1/employees/${employeeId}`)
      .set('Authorization', bearer(hrToken))
      .send({ workEmail: 'alice.updated@test.hr' })
      .expect(200);
    await new Promise((resolve) => { setTimeout(resolve, 150); });

    const audit = await getRow<{ after: unknown }>('audit_logs', { resourceId: employeeId, action: 'employees.update' });
    expect(JSON.stringify(audit?.after)).toContain('alice.updated@test.hr');

    await truncateTables('audit_logs');
    await getRequest().get('/api/v1/employees').set('Authorization', bearer(hrToken)).expect(200);
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    expect(await countRows('audit_logs')).toBe(0);
  });

  it('includes audit metadata and redacts secrets', async () => {
    await getRequest()
      .post('/api/v1/employees')
      .set('Authorization', bearer(hrToken))
      .send({ firstName: 'PII', lastName: 'Test', workEmail: 'pii@test.hr', joinedAt: '2024-01-01', employmentType: 'FULL_TIME' });
    await new Promise((resolve) => { setTimeout(resolve, 150); });

    const rows = await query<Record<string, unknown>>('SELECT * FROM "audit_logs" LIMIT 10');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.companyId).toBeDefined();
      expect(row.userId).toBeDefined();
      expect(row.createdAt).toBeDefined();
      expect(JSON.stringify(row)).not.toMatch(/ValidPass@123|"password"/);
    }
  });
});
