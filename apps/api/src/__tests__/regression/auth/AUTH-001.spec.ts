import { describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { getRow } from '../../helpers/db.helper';
import { bearer, decodeJwt } from '../../helpers/auth.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('auth-001');

describe('AUTH-001 - Successful login with valid credentials', () => {
  it('returns 200, wrapped token body, refresh cookie, and 15 minute JWT', async () => {
    const seed = suite.getSeed();
    const res = await getRequest()
      .post('/api/v1/auth/login')
      .send({ email: seed.adminEmail, password: 'ValidPass@123' })
      .expect(200);

    expect(res.body).toMatchObject({
      data: expect.objectContaining({ accessToken: expect.any(String) }),
    });
    const cookie = (res.headers['set-cookie'] as string[]).find((value) => value.includes('__Secure-rt'));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);

    const payload = decodeJwt<{ sub: string; companyId: string; roles: string[]; iat: number; exp: number }>(
      res.body.data.accessToken,
    );
    expect(payload.sub).toBe(seed.adminUserId);
    expect(payload.companyId).toBe(seed.companyId);
    expect(Array.isArray(payload.roles)).toBe(true);
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('updates last login and allows authenticated /auth/me', async () => {
    const seed = suite.getSeed();
    const before = Date.now();
    const login = await getRequest()
      .post('/api/v1/auth/login')
      .send({ email: seed.adminEmail, password: 'ValidPass@123' })
      .expect(200);

    const user = await getRow<{ lastLoginAt: Date }>('users', { id: seed.adminUserId });
    expect(new Date(user!.lastLoginAt).getTime()).toBeGreaterThanOrEqual(before - 1000);

    await getRequest()
      .get('/api/v1/auth/me')
      .set('Authorization', bearer(login.body.data.accessToken))
      .expect(200);
  });
});
