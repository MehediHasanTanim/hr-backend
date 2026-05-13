import { describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { getRow } from '../../helpers/db.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('auth-002');

describe('AUTH-002 - Login rejected with incorrect password', () => {
  it('returns 401 with a generic error and no refresh cookie', async () => {
    const seed = suite.getSeed();
    const res = await getRequest()
      .post('/api/v1/auth/login')
      .send({ email: seed.adminEmail, password: 'WrongPassword' })
      .expect(401);

    expect(res.body).toMatchObject({
      title: 'UNAUTHORIZED',
      detail: expect.stringMatching(/invalid email or password/i),
    });
    expect(res.body.detail).not.toMatch(/wrong password|password incorrect/i);
    expect(res.headers['set-cookie']).toBeFalsy();
  });

  it('does not update lastLoginAt on failed login', async () => {
    const seed = suite.getSeed();
    const before = await getRow<{ lastLoginAt: Date | null }>('users', { id: seed.adminUserId });
    await getRequest()
      .post('/api/v1/auth/login')
      .send({ email: seed.adminEmail, password: 'WrongPassword' });

    const after = await getRow<{ lastLoginAt: Date | null }>('users', { id: seed.adminUserId });
    expect(after?.lastLoginAt).toEqual(before?.lastLoginAt);
  });
});
