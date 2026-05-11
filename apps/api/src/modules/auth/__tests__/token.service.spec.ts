import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as crypto from 'node:crypto';
import { UnauthorizedError } from '@hr/shared';
import { RedisKeys } from '@/common/redis/redis-keys';
import { createConfigMock, createRedisMock } from '@/__mocks__/factories';
import { TokenService } from '../token.service';

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('signed-access-token'),
    verify: vi.fn(),
  },
  sign: vi.fn().mockReturnValue('signed-access-token'),
  verify: vi.fn(),
}));

import * as jwt from 'jsonwebtoken';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomBytes: vi.fn().mockImplementation((size: number) => Buffer.alloc(size, 0xab)),
    randomUUID: vi.fn()
      .mockReturnValueOnce('new-session-uuid-001')
      .mockReturnValue('new-session-uuid-002'),
  };
});

let service: TokenService;
let redis: ReturnType<typeof createRedisMock>;

const MOCK_USER_ID = 'user-uuid-001';
const MOCK_COMPANY_ID = 'company-uuid-001';
const MOCK_SESSION_ID = 'session-uuid-001';
const MOCK_EMAIL = 'admin@demo-corp.hr';
const MOCK_ROLES = ['role-admin-uuid'];
const DETERMINISTIC_TOKEN = Buffer.alloc(32, 0xab).toString('hex');
const DETERMINISTIC_HASH = crypto.createHash('sha256').update(DETERMINISTIC_TOKEN).digest('hex');

function refreshMeta(sessionId = MOCK_SESSION_ID) {
  return {
    userId: MOCK_USER_ID,
    companyId: MOCK_COMPANY_ID,
    email: MOCK_EMAIL,
    roles: MOCK_ROLES,
    sessionId,
  };
}

beforeEach(() => {
  redis = createRedisMock();
  service = new TokenService(createConfigMock() as never, redis as never);
  vi.clearAllMocks();
  vi.mocked(crypto.randomUUID).mockReturnValue('new-session-uuid-001');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-03-15T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TokenService', () => {
  describe('issueRefreshToken()', () => {
    it('stores SHA-256 hash of token in Redis instead of the plaintext token', async () => {
      await service.issueRefreshToken(refreshMeta());

      expect(redis.set).toHaveBeenCalledWith(
        RedisKeys.refreshToken(DETERMINISTIC_HASH),
        expect.any(String),
        604_800,
      );
      expect(redis.set.mock.calls[0]?.[0]).not.toContain(DETERMINISTIC_TOKEN);
    });

    it('stores userId, companyId, email, roles, sessionId, and issuedAt in the Redis value', async () => {
      await service.issueRefreshToken(refreshMeta());

      const storedValue = redis.set.mock.calls[0]?.[1] as string;
      expect(JSON.parse(storedValue)).toMatchObject({
        ...refreshMeta(),
        issuedAt: new Date('2024-03-15T10:00:00.000Z').getTime(),
      });
    });

    it('returns the plaintext token to the caller', async () => {
      await expect(service.issueRefreshToken(refreshMeta())).resolves.toBe(DETERMINISTIC_TOKEN);
    });

    it('sets TTL of exactly seven days in seconds', async () => {
      await service.issueRefreshToken(refreshMeta());

      expect(redis.set.mock.calls[0]?.[2]).toBe(604_800);
    });
  });

  describe('rotateRefreshToken()', () => {
    it('returns a new access token and refresh token on valid rotation', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ ...refreshMeta(), issuedAt: 1 }));

      await expect(service.rotateRefreshToken(DETERMINISTIC_TOKEN, MOCK_SESSION_ID)).resolves.toMatchObject({
        accessToken: 'signed-access-token',
        refreshToken: DETERMINISTIC_TOKEN,
      });
    });

    it('deletes the old token hash from Redis after rotation', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ ...refreshMeta(), issuedAt: 1 }));

      await service.rotateRefreshToken(DETERMINISTIC_TOKEN, MOCK_SESSION_ID);

      expect(redis.del).toHaveBeenCalledWith(RedisKeys.refreshToken(DETERMINISTIC_HASH));
    });

    it('issues the new refresh token with a new sessionId', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ ...refreshMeta(), issuedAt: 1 }));
      const issueSpy = vi.spyOn(service, 'issueRefreshToken');

      await service.rotateRefreshToken(DETERMINISTIC_TOKEN, MOCK_SESSION_ID);

      expect(issueSpy.mock.calls[0]?.[0]).toMatchObject({ sessionId: 'new-session-uuid-001' });
      expect(issueSpy.mock.calls[0]?.[0].sessionId).not.toBe(MOCK_SESSION_ID);
    });

    it('signs the new access token with the rotated sessionId', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ ...refreshMeta(), issuedAt: 1 }));
      const signSpy = vi.spyOn(service, 'signAccessToken');

      await service.rotateRefreshToken(DETERMINISTIC_TOKEN, MOCK_SESSION_ID);

      expect(signSpy).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'new-session-uuid-001' }));
    });

    it('throws UnauthorizedError when token hash is not found in Redis', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.rotateRefreshToken(DETERMINISTIC_TOKEN, MOCK_SESSION_ID)).rejects.toThrow(UnauthorizedError);
    });

    it('calls revokeSession when token hash is not found to detect a reuse attempt', async () => {
      redis.get.mockResolvedValue(null);
      const revokeSpy = vi.spyOn(service, 'revokeSession').mockResolvedValue(undefined);

      await service.rotateRefreshToken(DETERMINISTIC_TOKEN, MOCK_SESSION_ID).catch(() => undefined);

      expect(revokeSpy).toHaveBeenCalledWith(MOCK_SESSION_ID);
    });

    it('throws UnauthorizedError when stored sessionId does not match presented sessionId', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ ...refreshMeta('different-session-id'), issuedAt: 1 }));

      await expect(service.rotateRefreshToken(DETERMINISTIC_TOKEN, MOCK_SESSION_ID)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('revokeSession()', () => {
    it('deletes every Redis refresh key whose stored sessionId matches the target', async () => {
      const matchingKey1 = 'auth:refresh:hash-abc';
      const matchingKey2 = 'auth:refresh:hash-def';
      const nonMatchingKey = 'auth:refresh:hash-xyz';
      redis.keys.mockResolvedValue([matchingKey1, matchingKey2, nonMatchingKey]);
      redis.get
        .mockResolvedValueOnce(JSON.stringify({ sessionId: MOCK_SESSION_ID }))
        .mockResolvedValueOnce(JSON.stringify({ sessionId: MOCK_SESSION_ID }))
        .mockResolvedValueOnce(JSON.stringify({ sessionId: 'other-session' }));

      await service.revokeSession(MOCK_SESSION_ID);

      expect(redis.del).toHaveBeenCalledWith(matchingKey1);
      expect(redis.del).toHaveBeenCalledWith(matchingKey2);
      expect(redis.del).not.toHaveBeenCalledWith(nonMatchingKey);
    });

    it('does nothing when no Redis keys exist for the session', async () => {
      redis.keys.mockResolvedValue([]);

      await expect(service.revokeSession(MOCK_SESSION_ID)).resolves.not.toThrow();
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('handles a Redis key that has already expired without throwing', async () => {
      redis.keys.mockResolvedValue(['auth:refresh:some-key']);
      redis.get.mockResolvedValue(null);

      await expect(service.revokeSession(MOCK_SESSION_ID)).resolves.not.toThrow();
    });
  });

  describe('access tokens and cookies', () => {
    it('signs access token payload with RS256 issuer and audience', () => {
      const payload = {
        sub: MOCK_USER_ID,
        companyId: MOCK_COMPANY_ID,
        email: MOCK_EMAIL,
        roles: MOCK_ROLES,
        sessionId: MOCK_SESSION_ID,
      };

      expect(service.signAccessToken(payload)).toBe('signed-access-token');
      expect(jwt.sign).toHaveBeenCalledWith(payload, 'mock-private-key', {
        algorithm: 'RS256',
        expiresIn: '15m',
        issuer: 'hr-api',
        audience: 'hr-web',
      });
    });

    it('verifies access token with RS256 issuer and audience', () => {
      const payload = {
        sub: MOCK_USER_ID,
        companyId: MOCK_COMPANY_ID,
        email: MOCK_EMAIL,
        roles: MOCK_ROLES,
        sessionId: MOCK_SESSION_ID,
      };
      vi.mocked(jwt.verify).mockReturnValue(payload);

      expect(service.verifyAccessToken('jwt-token')).toEqual(payload);
      expect(jwt.verify).toHaveBeenCalledWith('jwt-token', 'mock-public-key', {
        algorithms: ['RS256'],
        issuer: 'hr-api',
        audience: 'hr-web',
        ignoreExpiration: false,
      });
    });

    it('allows verifying an expired token when ignoreExpiration is true', () => {
      vi.mocked(jwt.verify).mockReturnValue({
        sub: MOCK_USER_ID,
        companyId: MOCK_COMPANY_ID,
        email: MOCK_EMAIL,
        roles: MOCK_ROLES,
        sessionId: MOCK_SESSION_ID,
      });

      service.verifyAccessToken('jwt-token', true);

      expect(jwt.verify).toHaveBeenCalledWith('jwt-token', 'mock-public-key', expect.objectContaining({
        ignoreExpiration: true,
      }));
    });

    it('sets refresh token cookie with secure flag disabled outside production', () => {
      const reply = { setCookie: vi.fn() };

      service.setRefreshTokenCookie(reply as never, 'refresh-token');

      expect(reply.setCookie).toHaveBeenCalledWith('__Secure-rt', 'refresh-token', expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/api/v1/auth/refresh',
        maxAge: 604_800,
      }));
    });

    it('sets refresh token cookie with secure flag enabled in production', () => {
      service = new TokenService(createConfigMock({ app: {
        nodeEnv: 'production',
        port: 3000,
        host: '0.0.0.0',
        apiBaseUrl: 'https://api.example.com',
        webBaseUrl: 'https://app.example.com',
        corsOrigin: ['https://app.example.com'],
        swaggerEnabled: false,
      } }) as never, redis as never);
      const reply = { setCookie: vi.fn() };

      service.setRefreshTokenCookie(reply as never, 'refresh-token');

      expect(reply.setCookie).toHaveBeenCalledWith('__Secure-rt', 'refresh-token', expect.objectContaining({
        secure: true,
      }));
    });

    it('clears refresh token cookie at the refresh path', () => {
      const reply = { clearCookie: vi.fn() };

      service.clearRefreshTokenCookie(reply as never);

      expect(reply.clearCookie).toHaveBeenCalledWith('__Secure-rt', { path: '/api/v1/auth/refresh' });
    });

    it('returns SHA-256 hash for a supplied value', () => {
      expect(service.sha256('value')).toBe(crypto.createHash('sha256').update('value').digest('hex'));
    });
  });

  describe('revokeUser()', () => {
    it('deletes every Redis refresh key whose stored userId matches the target', async () => {
      const matchingKey = 'auth:refresh:user-match';
      const nonMatchingKey = 'auth:refresh:user-other';
      redis.keys.mockResolvedValue([matchingKey, nonMatchingKey]);
      redis.get
        .mockResolvedValueOnce(JSON.stringify({ userId: MOCK_USER_ID }))
        .mockResolvedValueOnce(JSON.stringify({ userId: 'other-user' }));

      await service.revokeUser(MOCK_USER_ID);

      expect(redis.del).toHaveBeenCalledWith(matchingKey);
      expect(redis.del).not.toHaveBeenCalledWith(nonMatchingKey);
    });

    it('ignores expired refresh keys while revoking a user', async () => {
      redis.keys.mockResolvedValue(['auth:refresh:expired']);
      redis.get.mockResolvedValue(null);

      await expect(service.revokeUser(MOCK_USER_ID)).resolves.not.toThrow();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
