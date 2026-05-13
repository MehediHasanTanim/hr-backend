import { beforeEach, describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { bearer, loginAs } from '../../helpers/auth.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('sec-003');

let token: string;

beforeEach(async () => {
  token = (await loginAs(getRequest(), suite.getSeed().adminEmail)).accessToken;
});

describe('SEC-003 - Security response headers', () => {
  it('sets hardened response headers and omits X-Powered-By', async () => {
    const res = await getRequest().get('/api/v1/employees').set('Authorization', bearer(token)).expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(['DENY', 'SAMEORIGIN']).toContain(String(res.headers['x-frame-options']).toUpperCase());
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(['strict-origin-when-cross-origin', 'strict-origin', 'no-referrer'].some((value) =>
      String(res.headers['referrer-policy']).includes(value))).toBe(true);
  });
});
