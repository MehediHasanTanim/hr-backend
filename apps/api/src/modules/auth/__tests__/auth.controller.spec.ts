import { describe, expect, it, vi } from 'vitest';
import { AuthController } from '../auth.controller';
import { SsoController } from '../sso/sso.controller';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.MINIO_ENDPOINT = 'localhost';
  process.env.MINIO_ACCESS_KEY = 'access';
  process.env.MINIO_SECRET_KEY = 'secret';
  process.env.JWT_PRIVATE_KEY_PATH = 'keys/private.pem';
  process.env.JWT_PUBLIC_KEY_PATH = 'keys/public.pem';
  process.env.COOKIE_SECRET = '12345678901234567890123456789012';
  process.env.MAIL_HOST = 'localhost';
  process.env.MAIL_FROM = 'test@example.com';
});

describe('AuthController mobile refresh token responses', () => {
  it('keeps web login cookie-only and omits refreshToken from the body', async () => {
    const authService = {
      login: vi.fn().mockResolvedValue({ accessToken: 'access-token', refreshToken: 'refresh-token' }),
    };
    const tokenService = { setRefreshTokenCookie: vi.fn() };
    const controller = new AuthController(authService as never, tokenService as never);
    const reply = {};

    await expect(controller.login(
      { email: 'admin@test.hr', password: 'pass' } as never,
      { headers: {} } as never,
      reply as never,
    )).resolves.toEqual({ accessToken: 'access-token' });
    expect(tokenService.setRefreshTokenCookie).toHaveBeenCalledWith(reply, 'refresh-token');
  });

  it('returns refreshToken in mobile login response while still setting the web cookie', async () => {
    const authService = {
      login: vi.fn().mockResolvedValue({ accessToken: 'access-token', refreshToken: 'refresh-token' }),
    };
    const tokenService = { setRefreshTokenCookie: vi.fn() };
    const controller = new AuthController(authService as never, tokenService as never);
    const reply = {};

    await expect(controller.login(
      { email: 'admin@test.hr', password: 'pass' } as never,
      { headers: { 'x-client-type': 'mobile' } } as never,
      reply as never,
    )).resolves.toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    expect(tokenService.setRefreshTokenCookie).toHaveBeenCalledWith(reply, 'refresh-token');
  });

  it('rotates a body refresh token for mobile clients and returns the new token', async () => {
    const authService = {
      extractSessionIdFromExpiredToken: vi.fn().mockReturnValue('session-id'),
    };
    const tokenService = {
      rotateRefreshToken: vi.fn().mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      }),
      setRefreshTokenCookie: vi.fn(),
    };
    const controller = new AuthController(authService as never, tokenService as never);
    const reply = {};

    await expect(controller.refresh(
      { refreshToken: 'mobile-refresh-token' } as never,
      {
        cookies: { '__Secure-rt': 'cookie-refresh-token' },
        headers: { authorization: 'Bearer expired-access-token' },
      } as never,
      reply as never,
    )).resolves.toEqual({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' });

    expect(tokenService.rotateRefreshToken).toHaveBeenCalledWith('mobile-refresh-token', 'session-id');
    expect(tokenService.setRefreshTokenCookie).toHaveBeenCalledWith(reply, 'new-refresh-token');
  });

  it('keeps web accept-invite cookie-only and omits refreshToken from the body', async () => {
    const authService = {
      acceptInvite: vi.fn().mockResolvedValue({ accessToken: 'access-token', refreshToken: 'refresh-token' }),
    };
    const tokenService = { setRefreshTokenCookie: vi.fn() };
    const controller = new AuthController(authService as never, tokenService as never);
    const reply = {};

    await expect(controller.acceptInvite(
      { token: 'invite-token', password: 'ValidPass@123' } as never,
      { headers: {} } as never,
      reply as never,
    )).resolves.toEqual({ accessToken: 'access-token' });
    expect(tokenService.setRefreshTokenCookie).toHaveBeenCalledWith(reply, 'refresh-token');
  });

  it('returns refreshToken in mobile accept-invite response while still setting the web cookie', async () => {
    const authService = {
      acceptInvite: vi.fn().mockResolvedValue({ accessToken: 'access-token', refreshToken: 'refresh-token' }),
    };
    const tokenService = { setRefreshTokenCookie: vi.fn() };
    const controller = new AuthController(authService as never, tokenService as never);
    const reply = {};

    await expect(controller.acceptInvite(
      { token: 'invite-token', password: 'ValidPass@123' } as never,
      { headers: { 'x-client-type': 'mobile' } } as never,
      reply as never,
    )).resolves.toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    expect(tokenService.setRefreshTokenCookie).toHaveBeenCalledWith(reply, 'refresh-token');
  });
});

describe('SsoController mobile refresh token redirect', () => {
  it('omits refreshToken from the web callback fragment while still setting the web cookie', async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ client: 'web' })),
      del: vi.fn(),
    };
    const config = {
      get: vi.fn((key: string) => (key === 'app' ? { webBaseUrl: 'https://app.test.hr' } : {})),
    };
    const authService = {
      loginWithSsoProfile: vi.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    };
    const tokenService = { setRefreshTokenCookie: vi.fn() };
    const controller = new SsoController(
      redis as never,
      config as never,
      authService as never,
      tokenService as never,
    );
    const reply = { redirect: vi.fn() };

    await controller.callback(
      { user: { provider: 'google', providerId: '1', email: 'admin@test.hr', firstName: 'A', lastName: 'B' } } as never,
      reply as never,
      'state-1',
    );

    expect(tokenService.setRefreshTokenCookie).toHaveBeenCalledWith(reply, 'refresh-token');
    expect(reply.redirect).toHaveBeenCalledWith('https://app.test.hr/sso/callback#accessToken=access-token');
  });

  it('includes refreshToken in the mobile callback fragment while still setting the web cookie', async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ client: 'mobile' })),
      del: vi.fn(),
    };
    const config = {
      get: vi.fn((key: string) => (key === 'app' ? { webBaseUrl: 'https://app.test.hr' } : {})),
    };
    const authService = {
      loginWithSsoProfile: vi.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    };
    const tokenService = { setRefreshTokenCookie: vi.fn() };
    const controller = new SsoController(
      redis as never,
      config as never,
      authService as never,
      tokenService as never,
    );
    const reply = { redirect: vi.fn() };

    await controller.callback(
      { user: { provider: 'google', providerId: '1', email: 'admin@test.hr', firstName: 'A', lastName: 'B' } } as never,
      reply as never,
      'state-1',
    );

    expect(tokenService.setRefreshTokenCookie).toHaveBeenCalledWith(reply, 'refresh-token');
    expect(reply.redirect).toHaveBeenCalledWith(
      'https://app.test.hr/sso/callback#accessToken=access-token&refreshToken=refresh-token',
    );
  });
});
