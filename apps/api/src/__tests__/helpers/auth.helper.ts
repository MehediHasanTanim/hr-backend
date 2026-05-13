import type { SuperTest, Test } from 'supertest';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';

export interface TokenSet {
  accessToken: string;
  refreshCookie: string;
}

export async function loginAs(
  request: SuperTest<Test>,
  email: string,
  password = 'ValidPass@123',
): Promise<TokenSet> {
  const res = await request.post('/api/v1/auth/login').send({ email, password }).expect(200);
  const accessToken = (res.body as { data: { accessToken: string } }).data.accessToken;
  const setCookie = res.headers['set-cookie'] as string[] | string;
  const refreshCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!accessToken || !refreshCookie) throw new Error(`Login failed for ${email}`);
  return { accessToken, refreshCookie };
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

export function decodeJwt<T>(token: string): T {
  return jwt.decode(token) as T;
}

export function buildExpiredToken(userId: string, companyId: string): string {
  const key = readFileSync(process.env.JWT_PRIVATE_KEY_PATH!);
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: userId,
      companyId,
      email: 'test@test.hr',
      roles: [],
      sessionId: 'expired-session',
      iat: now - 1800,
      exp: now - 900,
      iss: 'hr-api',
      aud: 'hr-web',
    },
    key,
    { algorithm: 'RS256', noTimestamp: true },
  );
}
