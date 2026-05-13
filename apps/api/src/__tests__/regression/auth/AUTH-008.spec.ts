import { describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { redisExpire, redisKeys } from '../../helpers/redis.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('auth-008');

async function issueResetToken(email: string): Promise<string> {
  await getRequest().post('/api/v1/auth/forgot-password').send({ email }).expect(200);
  const keys = await redisKeys('auth:pwd-reset:*');
  expect(keys.length).toBeGreaterThan(0);
  return keys[0]!.replace('auth:pwd-reset:', '');
}

describe('AUTH-008 - Password reset token single use', () => {
  it('changes the password and allows login with the new password', async () => {
    const seed = suite.getSeed();
    const token = await issueResetToken(seed.adminEmail);
    await getRequest()
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'NewPass@456' })
      .expect(200);

    await getRequest()
      .post('/api/v1/auth/login')
      .send({ email: seed.adminEmail, password: 'NewPass@456' })
      .expect(200);
  });

  it('rejects reuse and expired reset tokens', async () => {
    const seed = suite.getSeed();
    const token = await issueResetToken(seed.adminEmail);
    await getRequest().post('/api/v1/auth/reset-password').send({ token, newPassword: 'NewPass@456' }).expect(200);
    await getRequest().post('/api/v1/auth/reset-password').send({ token, newPassword: 'AnotherPass@789' }).expect(400);

    const expired = await issueResetToken(seed.hrEmail);
    await redisExpire(`auth:pwd-reset:${expired}`, 0);
    await getRequest().post('/api/v1/auth/reset-password').send({ token: expired, newPassword: 'AnyPass@123' }).expect(401);
  });
});
