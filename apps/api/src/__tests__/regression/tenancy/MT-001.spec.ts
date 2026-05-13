import { beforeEach, describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { bearer, loginAs } from '../../helpers/auth.helper';
import { flushTestRedis } from '../../helpers/redis.helper';
import { RESET_TABLES, setupRegressionSuite } from '../../helpers/regression.helper';
import { truncateTables } from '../../helpers/db.helper';
import { seedCompany, type SeedCompanyResult } from '../../helpers/seed.helper';

setupRegressionSuite('mt-001-bootstrap');

let companyA: SeedCompanyResult;
let companyB: SeedCompanyResult;
let tokenA: string;
let tokenB: string;

beforeEach(async () => {
  await truncateTables(...RESET_TABLES);
  await flushTestRedis();
  companyA = await seedCompany('mt-001-a');
  companyB = await seedCompany('mt-001-b');
  tokenA = (await loginAs(getRequest(), companyA.adminEmail)).accessToken;
  tokenB = (await loginAs(getRequest(), companyB.adminEmail)).accessToken;
});

describe('MT-001 - List endpoints are company scoped', () => {
  it('returns only Company A employees, departments, payroll cycles, leave types, and audit logs', async () => {
    const employees = await getRequest().get('/api/v1/employees').set('Authorization', bearer(tokenA)).expect(200);
    const employeeIds = employees.body.data.map((item: { id: string }) => item.id);
    expect(employeeIds).toEqual(expect.arrayContaining([
      companyA.adminEmployeeId,
      companyA.hrEmployeeId,
      companyA.empEmployeeId,
    ]));
    expect(employeeIds).not.toContain(companyB.adminEmployeeId);

    await getRequest().get('/api/v1/departments').set('Authorization', bearer(tokenA)).expect(200);
    await getRequest().get('/api/v1/payroll/cycles').set('Authorization', bearer(tokenA)).expect(200);

    const leave = await getRequest().get('/api/v1/leave/types').set('Authorization', bearer(tokenA)).expect(200);
    for (const type of leave.body.data as Array<{ companyId: string }>) {
      expect(type.companyId).toBe(companyA.companyId);
    }

    const hrTokenA = (await loginAs(getRequest(), companyA.hrEmail)).accessToken;
    const hrTokenB = (await loginAs(getRequest(), companyB.hrEmail)).accessToken;
    await getRequest().post('/api/v1/employees').set('Authorization', bearer(hrTokenA)).send({
      firstName: 'Alice',
      lastName: 'A',
      workEmail: 'alice.a@test.hr',
      joinedAt: '2024-01-01',
      employmentType: 'FULL_TIME',
    }).expect(201);
    await getRequest().post('/api/v1/employees').set('Authorization', bearer(hrTokenB)).send({
      firstName: 'Bob',
      lastName: 'B',
      workEmail: 'bob.b@test.hr',
      joinedAt: '2024-01-01',
      employmentType: 'FULL_TIME',
    }).expect(201);
    await new Promise((resolve) => { setTimeout(resolve, 150); });

    const logs = await getRequest()
      .get('/api/v1/compliance/audit-logs')
      .set('Authorization', bearer(tokenA))
      .expect(200);
    for (const log of logs.body.data as Array<{ companyId: string }>) {
      expect(log.companyId).toBe(companyA.companyId);
    }
  });

  it('Company B token does not see Company A employees', async () => {
    const res = await getRequest().get('/api/v1/employees').set('Authorization', bearer(tokenB)).expect(200);
    const ids = res.body.data.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(companyA.adminEmployeeId);
    expect(ids).toContain(companyB.adminEmployeeId);
  });
});
