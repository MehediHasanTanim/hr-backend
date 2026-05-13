import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { getRequest } from '../../helpers/app.helper';
import { bearer, buildExpiredToken } from '../../helpers/auth.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('auth-004');

describe('AUTH-004 - Expired and malformed tokens', () => {
  it('rejects expired, missing, malformed, and wrong-algorithm tokens', async () => {
    const seed = suite.getSeed();
    const expired = buildExpiredToken(seed.adminUserId, seed.companyId);
    await getRequest().get('/api/v1/employees').set('Authorization', bearer(expired)).expect(401);

    const missing = await getRequest().get('/api/v1/employees').expect(401);
    expect(missing.headers['set-cookie']).toBeFalsy();

    await getRequest().get('/api/v1/employees').set('Authorization', 'Bearer not.a.jwt').expect(401);

    const hs256Token = jwt.sign({ sub: seed.adminUserId, companyId: seed.companyId }, 'secret', {
      algorithm: 'HS256',
      expiresIn: '15m',
    });
    await getRequest().get('/api/v1/employees').set('Authorization', bearer(hs256Token)).expect(401);
  });
});
