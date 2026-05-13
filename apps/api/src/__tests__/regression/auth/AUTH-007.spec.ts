import { beforeEach, describe, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { bearer, loginAs } from '../../helpers/auth.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('auth-007');

let hrToken: string;
let empToken: string;

beforeEach(async () => {
  const seed = suite.getSeed();
  hrToken = (await loginAs(getRequest(), seed.hrEmail)).accessToken;
  empToken = (await loginAs(getRequest(), seed.empEmail)).accessToken;
});

describe('AUTH-007 - RBAC role enforcement', () => {
  it('blocks Employee role from HR endpoints and allows self-scope endpoints', async () => {
    await getRequest().get('/api/v1/employees').set('Authorization', bearer(empToken)).expect(403);
    await getRequest()
      .post('/api/v1/employees')
      .set('Authorization', bearer(empToken))
      .send({ firstName: 'Test', lastName: 'User', email: 'new@test.hr' })
      .expect(403);
    await getRequest().get('/api/v1/payroll/cycles').set('Authorization', bearer(empToken)).expect(403);

    await getRequest().get('/api/v1/employees').set('Authorization', bearer(hrToken)).expect(200);
    await getRequest().get('/api/v1/auth/me').set('Authorization', bearer(empToken)).expect(200);
    await getRequest().get('/api/v1/payslips').set('Authorization', bearer(empToken)).expect(200);
  });
});
