import { beforeEach, describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { query } from '../../helpers/db.helper';
import { bearer, loginAs } from '../../helpers/auth.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('aud-002');

let adminToken: string;

beforeEach(async () => {
  adminToken = (await loginAs(getRequest(), suite.getSeed().adminEmail)).accessToken;
  await getRequest()
    .post('/api/v1/employees')
    .set('Authorization', bearer(adminToken))
    .send({ firstName: 'X', lastName: 'Y', workEmail: 'xy@test.hr', joinedAt: '2024-01-01', employmentType: 'FULL_TIME' });
  await new Promise((resolve) => { setTimeout(resolve, 150); });
});

describe('AUD-002 - Audit log append-only API surface', () => {
  it('does not expose update or delete endpoints for audit logs', async () => {
    const rows = await query<{ id: string }>('SELECT id FROM "audit_logs" LIMIT 1');
    const id = rows[0]?.id;
    expect(id).toBeDefined();

    const del = await getRequest()
      .delete(`/api/v1/compliance/audit-logs/${id}`)
      .set('Authorization', bearer(adminToken));
    expect([404, 405]).toContain(del.status);

    const patch = await getRequest()
      .patch(`/api/v1/compliance/audit-logs/${id}`)
      .set('Authorization', bearer(adminToken))
      .send({ action: 'fake' });
    expect([404, 405]).toContain(patch.status);
  });

  it('returns audit log entries through the read-only listing endpoint', async () => {
    const res = await getRequest()
      .get('/api/v1/compliance/audit-logs')
      .set('Authorization', bearer(adminToken))
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
