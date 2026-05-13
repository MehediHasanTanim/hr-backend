import { describe, expect, it } from 'vitest';
import { getRequest } from '../../helpers/app.helper';
import { setupRegressionSuite } from '../../helpers/regression.helper';

const suite = setupRegressionSuite('auth-006');

describe('AUTH-006 - Rate limiting blocks brute-force login attempts', () => {
  it('returns 429 after repeated failed login attempts from one IP', async () => {
    const seed = suite.getSeed();
    for (let index = 0; index < 10; index += 1) {
      await getRequest()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '10.0.0.42')
        .send({ email: seed.adminEmail, password: 'WrongPass!' });
    }

    await getRequest()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.0.0.42')
      .send({ email: seed.adminEmail, password: 'ValidPass@123' })
      .expect(429);
  });

  it('includes retry metadata on throttled responses', async () => {
    const seed = suite.getSeed();
    for (let index = 0; index < 11; index += 1) {
      await getRequest()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: seed.adminEmail, password: 'Wrong!' });
    }

    const res = await getRequest()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.0.0.99')
      .send({ email: seed.adminEmail, password: 'Wrong!' });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after'] ?? res.headers['x-ratelimit-reset']).toBeDefined();
  });
});
