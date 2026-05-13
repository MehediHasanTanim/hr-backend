import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { getRequest } from '../../helpers/app.helper';
import { bearer, loginAs } from '../../helpers/auth.helper';
import { redisKeys } from '../../helpers/redis.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('auth-003');

function tokenHashFromCookie(cookie: string): string {
  const raw = cookie.split(';')[0]!.split('=')[1]!;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

describe('AUTH-003 - Refresh token rotation', () => {
  it('rotates a refresh token and removes the old Redis hash', async () => {
    const seed = suite.getSeed();
    const { accessToken, refreshCookie } = await loginAs(getRequest(), seed.adminEmail);
    const oldHash = tokenHashFromCookie(refreshCookie);
    expect(await redisKeys(`auth:refresh:${oldHash}`)).toHaveLength(1);

    const res = await getRequest()
      .post('/api/v1/auth/refresh')
      .set('Authorization', bearer(accessToken))
      .set('Cookie', refreshCookie)
      .expect(200);

    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.headers['set-cookie']).toBeDefined();
    expect(await redisKeys(`auth:refresh:${oldHash}`)).toHaveLength(0);
  });

  it('rejects reuse of the rotated refresh token', async () => {
    const seed = suite.getSeed();
    const { accessToken, refreshCookie } = await loginAs(getRequest(), seed.adminEmail);
    await getRequest()
      .post('/api/v1/auth/refresh')
      .set('Authorization', bearer(accessToken))
      .set('Cookie', refreshCookie)
      .expect(200);

    const res = await getRequest()
      .post('/api/v1/auth/refresh')
      .set('Authorization', bearer(accessToken))
      .set('Cookie', refreshCookie)
      .expect(401);

    expect(res.body.title).toMatch(/UNAUTHORIZED|TOKEN_REVOKED/i);
  });
});
