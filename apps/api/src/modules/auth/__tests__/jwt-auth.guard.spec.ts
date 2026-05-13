import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UnauthorizedError } from '@hr/shared';
import type { RequestContext } from '@/common/context/request-context';
import { createRbacCacheMock, createTokenServiceMock } from '@/__mocks__/factories';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

vi.mock('@hr/prisma', () => ({
  PrismaService: class PrismaService {},
}));

function buildExecutionContext(authHeader?: string | null): ExecutionContext {
  const request: Record<string, unknown> = {
    url: '/api/v1/employees',
    headers: { authorization: authHeader ?? undefined, 'x-trace-id': 'trace-abc' },
  };

  return {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildHealthExecutionContext(): ExecutionContext {
  const request: Record<string, unknown> = {
    url: '/health',
    headers: {},
  };

  return {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

let guard: JwtAuthGuard;
let tokens: ReturnType<typeof createTokenServiceMock>;
let rbac: ReturnType<typeof createRbacCacheMock>;
let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };

beforeEach(() => {
  tokens = createTokenServiceMock();
  rbac = createRbacCacheMock();
  reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
  guard = new JwtAuthGuard(reflector as unknown as Reflector, tokens as never, rbac as never);
});

describe('JwtAuthGuard', () => {
  describe('@Public() decorator', () => {
    it('returns true without checking token when handler is decorated with @Public()', async () => {
      reflector.getAllAndOverride.mockImplementation((key: string) => key === IS_PUBLIC_KEY);

      await expect(guard.canActivate(buildExecutionContext(null))).resolves.toBe(true);
      expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
    });

    it('returns true without checking token when controller class is decorated with @Public()', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);

      await expect(guard.canActivate(buildExecutionContext(null))).resolves.toBe(true);
      expect(rbac.getUserPermissions).not.toHaveBeenCalled();
    });

    it('does not bypass guard when @Public() is absent and token is missing', async () => {
      await expect(guard.canActivate(buildExecutionContext(null))).rejects.toThrow(UnauthorizedError);
    });

    it('returns true for health checks without checking token', async () => {
      await expect(guard.canActivate(buildHealthExecutionContext())).resolves.toBe(true);
      expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('bearer token extraction', () => {
    it('throws UnauthorizedError when Authorization header is absent', async () => {
      await expect(guard.canActivate(buildExecutionContext(null))).rejects.toMatchObject({
        message: expect.stringMatching(/missing/i),
      });
    });

    it('throws UnauthorizedError when Authorization header does not start with Bearer', async () => {
      await Promise.all(
        ['Basic abc123', 'Token xyz', 'bearer lowercase', 'abc123', 'Bearer '].map((badHeader) =>
          expect(guard.canActivate(buildExecutionContext(badHeader))).rejects.toThrow(UnauthorizedError)),
      );
    });

    it('extracts token correctly from Bearer token format', async () => {
      tokens.verifyAccessToken.mockReturnValue({
        sub: 'user-uuid-001',
        companyId: 'company-uuid-001',
        email: 'test@example.com',
        roles: [],
        sessionId: 'session-001',
      });

      await guard.canActivate(buildExecutionContext('Bearer valid-token-here'));

      expect(tokens.verifyAccessToken).toHaveBeenCalledWith('valid-token-here');
    });
  });

  describe('JWT verification', () => {
    it('throws UnauthorizedError when token is expired', async () => {
      tokens.verifyAccessToken.mockImplementation(() => {
        const err = new Error('jwt expired');
        err.name = 'TokenExpiredError';
        throw err;
      });

      await expect(guard.canActivate(buildExecutionContext('Bearer expired-token'))).rejects.toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError when token signature is invalid', async () => {
      tokens.verifyAccessToken.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(guard.canActivate(buildExecutionContext('Bearer tampered-token'))).rejects.toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError when token algorithm is rejected', async () => {
      tokens.verifyAccessToken.mockImplementation(() => {
        const err = new Error('invalid algorithm');
        err.name = 'JsonWebTokenError';
        throw err;
      });

      await expect(guard.canActivate(buildExecutionContext('Bearer hs256-token'))).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('RequestContext attachment', () => {
    it('attaches RequestContext to request.user on successful verification', async () => {
      tokens.verifyAccessToken.mockReturnValue({
        sub: 'user-uuid-001',
        companyId: 'company-uuid-001',
        email: 'test@example.com',
        roles: ['role-admin'],
        sessionId: 'session-001',
      });
      rbac.getUserPermissions.mockResolvedValue(['employee:read', 'payroll:read']);
      const ctx = buildExecutionContext('Bearer valid-token');

      await guard.canActivate(ctx);

      const request = ctx.switchToHttp().getRequest<{ user: RequestContext }>();
      expect(request.user).toMatchObject({
        userId: 'user-uuid-001',
        companyId: 'company-uuid-001',
        email: 'test@example.com',
        roles: ['role-admin'],
        permissions: ['employee:read', 'payroll:read'],
        sessionId: 'session-001',
      });
    });

    it('loads permissions via RbacCacheService with userId and companyId', async () => {
      tokens.verifyAccessToken.mockReturnValue({
        sub: 'user-uuid-001',
        companyId: 'company-uuid-001',
        email: 'test@example.com',
        roles: [],
        sessionId: 'session-001',
      });

      await guard.canActivate(buildExecutionContext('Bearer valid-token'));

      expect(rbac.getUserPermissions).toHaveBeenCalledWith('user-uuid-001', 'company-uuid-001');
    });

    it('attaches x-trace-id from request header to RequestContext.traceId', async () => {
      tokens.verifyAccessToken.mockReturnValue({
        sub: 'u1',
        companyId: 'c1',
        email: 'e@e.com',
        roles: [],
        sessionId: 's1',
      });
      const ctx = buildExecutionContext('Bearer tok');
      const req = ctx.switchToHttp().getRequest<{
        headers: Record<string, string>;
        user: RequestContext;
      }>();
      req.headers['x-trace-id'] = 'my-trace-123';

      await guard.canActivate(ctx);

      expect(req.user.traceId).toBe('my-trace-123');
    });

    it('attaches an empty traceId when request header is absent', async () => {
      tokens.verifyAccessToken.mockReturnValue({
        sub: 'u1',
        companyId: 'c1',
        email: 'e@e.com',
        roles: [],
        sessionId: 's1',
      });
      const ctx = buildExecutionContext('Bearer tok');
      const req = ctx.switchToHttp().getRequest<{
        headers: Record<string, string | undefined>;
        user: RequestContext;
      }>();
      req.headers['x-trace-id'] = undefined;

      await guard.canActivate(ctx);

      expect(req.user.traceId).toBe('');
    });

    it('uses companyId from JWT payload instead of request body', async () => {
      tokens.verifyAccessToken.mockReturnValue({
        sub: 'user-001',
        companyId: 'legit-company-id',
        email: 'u@e.com',
        roles: [],
        sessionId: 's1',
      });
      const ctx = buildExecutionContext('Bearer valid-token');
      const req = ctx.switchToHttp().getRequest<{
        body: { companyId: string };
        user: RequestContext;
      }>();
      req.body = { companyId: 'attacker-company-id' };

      await guard.canActivate(ctx);

      expect(req.user.companyId).toBe('legit-company-id');
    });
  });
});
