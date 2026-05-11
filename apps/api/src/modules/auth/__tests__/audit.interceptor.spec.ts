import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import type { RequestContext } from '@/common/context/request-context';
import { buildRequestContext, createPrismaMock } from '@/__mocks__/factories';
import { AuditInterceptor } from '../interceptors/audit.interceptor';

vi.mock('@hr/prisma', () => ({
  PrismaService: class PrismaService {},
}));

function buildCtx(
  method: string,
  url: string,
  userContext?: RequestContext | null,
  body: unknown = {},
): ExecutionContext {
  const request = {
    method,
    url,
    body,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'Test/1.0' },
    user: userContext,
  };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

function buildHandler(value: unknown = { data: { id: 'result-001' } }): CallHandler {
  return { handle: () => of(value) };
}

function buildErrorHandler(error: Error): CallHandler {
  return { handle: () => throwError(() => error) };
}

let interceptor: AuditInterceptor;
let prisma: ReturnType<typeof createPrismaMock>;
let writeLogSpy: MockInstance<(data: unknown) => Promise<void>>;

beforeEach(() => {
  prisma = createPrismaMock();
  interceptor = new AuditInterceptor(prisma as never);
  writeLogSpy = vi.spyOn(
    interceptor as unknown as { writeAuditLog: (data: unknown) => Promise<void> },
    'writeAuditLog',
  ).mockResolvedValue(undefined);

  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-03-15T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AuditInterceptor', () => {
  describe('HTTP method filtering', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      it(`does not write audit log for ${method} requests`, async () => {
        await lastValueFrom(interceptor.intercept(
          buildCtx(method, '/api/v1/employees', buildRequestContext()),
          buildHandler(),
        ));

        expect(writeLogSpy).not.toHaveBeenCalled();
      });
    }

    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      it(`writes audit log for ${method} requests`, async () => {
        await lastValueFrom(interceptor.intercept(
          buildCtx(method, '/api/v1/employees', buildRequestContext()),
          buildHandler(),
        ));
        await vi.runAllTimersAsync();

        expect(writeLogSpy).toHaveBeenCalledTimes(1);
      });
    }
  });

  describe('audit log content', () => {
    it('records the correct action for POST requests', async () => {
      await lastValueFrom(interceptor.intercept(
        buildCtx('POST', '/api/v1/employees', buildRequestContext()),
        buildHandler(),
      ));
      await vi.runAllTimersAsync();

      expect(writeLogSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'employees.create' }));
    });

    it('records the correct action for PATCH requests', async () => {
      await lastValueFrom(interceptor.intercept(
        buildCtx('PATCH', '/api/v1/employees/emp-001', buildRequestContext()),
        buildHandler(),
      ));
      await vi.runAllTimersAsync();

      expect(writeLogSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'employees.update' }));
    });

    it('records the correct action for DELETE requests', async () => {
      await lastValueFrom(interceptor.intercept(
        buildCtx('DELETE', '/api/v1/employees/emp-001', buildRequestContext()),
        buildHandler(),
      ));
      await vi.runAllTimersAsync();

      expect(writeLogSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'employees.delete' }));
    });

    it('records actor identifiers from RequestContext', async () => {
      const user = buildRequestContext({ userId: 'actor-001', companyId: 'company-001' });
      await lastValueFrom(interceptor.intercept(buildCtx('POST', '/api/v1/payroll', user), buildHandler()));
      await vi.runAllTimersAsync();

      expect(writeLogSpy).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'actor-001',
        companyId: 'company-001',
      }));
    });

    it('records resource and resourceId from the URL path', async () => {
      await lastValueFrom(interceptor.intercept(
        buildCtx('PATCH', '/api/v1/employees/emp-uuid-999', buildRequestContext()),
        buildHandler(),
      ));
      await vi.runAllTimersAsync();

      expect(writeLogSpy).toHaveBeenCalledWith(expect.objectContaining({
        resource: 'employees',
        resourceId: 'emp-uuid-999',
      }));
    });

    it('records the IP address and user agent from the request', async () => {
      await lastValueFrom(interceptor.intercept(
        buildCtx('POST', '/api/v1/employees', buildRequestContext()),
        buildHandler(),
      ));
      await vi.runAllTimersAsync();

      expect(writeLogSpy).toHaveBeenCalledWith(expect.objectContaining({
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      }));
    });
  });

  describe('request body sanitization', () => {
    it('redacts password field from the request body in audit log', async () => {
      await lastValueFrom(interceptor.intercept(
        buildCtx('POST', '/api/v1/auth/register', buildRequestContext(), {
          email: 'user@test.com',
          password: 'SuperSecret1!',
        }),
        buildHandler(),
      ));
      await vi.runAllTimersAsync();

      const call = writeLogSpy.mock.calls[0]?.[0] as { after: Record<string, unknown> };
      expect(call.after.password).toBe('[REDACTED]');
    });

    it('redacts nested secret field from the request body', async () => {
      await lastValueFrom(interceptor.intercept(
        buildCtx('POST', '/api/v1/company/settings', buildRequestContext(), {
          key: 'integration',
          value: { apiKey: 'public-ok', secret: 'must-be-redacted' },
        }),
        buildHandler(),
      ));
      await vi.runAllTimersAsync();

      const call = writeLogSpy.mock.calls[0]?.[0] as { after: { value: { secret: string } } };
      expect(call.after.value.secret).toBe('[REDACTED]');
    });

    it('preserves non-sensitive fields in the audit log body', async () => {
      await lastValueFrom(interceptor.intercept(
        buildCtx('POST', '/api/v1/employees', buildRequestContext(), {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
        }),
        buildHandler(),
      ));
      await vi.runAllTimersAsync();

      const call = writeLogSpy.mock.calls[0]?.[0] as { after: Record<string, unknown> };
      expect(call.after.firstName).toBe('John');
      expect(call.after.email).toBe('john@test.com');
    });
  });

  describe('fire-and-forget non-blocking behavior', () => {
    it('does not block the response when audit write is slow', async () => {
      writeLogSpy.mockImplementation(() => new Promise(() => undefined));

      const resultPromise = lastValueFrom(interceptor.intercept(
        buildCtx('POST', '/api/v1/employees', buildRequestContext()),
        buildHandler({ ok: true }),
      ));

      await expect(resultPromise).resolves.toEqual({ ok: true });
    });

    it('does not throw when audit log write fails', async () => {
      writeLogSpy.mockRejectedValue(new Error('DB write failed'));

      await expect(lastValueFrom(interceptor.intercept(
        buildCtx('POST', '/api/v1/employees', buildRequestContext()),
        buildHandler(),
      ))).resolves.not.toThrow();
    });

    it('passes the response value through unchanged even when audit write fails', async () => {
      writeLogSpy.mockRejectedValue(new Error('DB write failed'));
      const expectedResponse = { data: { id: 'employee-001', name: 'Jane' } };

      await expect(lastValueFrom(interceptor.intercept(
        buildCtx('POST', '/api/v1/employees', buildRequestContext()),
        buildHandler(expectedResponse),
      ))).resolves.toEqual(expectedResponse);
    });
  });

  describe('unauthenticated and error paths', () => {
    it('skips audit log when request has no user context', async () => {
      await lastValueFrom(interceptor.intercept(buildCtx('POST', '/api/v1/auth/login', null), buildHandler()));
      await vi.runAllTimersAsync();

      expect(writeLogSpy).not.toHaveBeenCalled();
    });

    it('does not write an audit log when the request handler throws an error', async () => {
      await expect(lastValueFrom(interceptor.intercept(
        buildCtx('POST', '/api/v1/employees', buildRequestContext()),
        buildErrorHandler(new Error('Validation failed')),
      ))).rejects.toThrow('Validation failed');
      await vi.runAllTimersAsync();

      expect(writeLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('audit log persistence', () => {
    it('persists audit log through the unscoped Prisma client when companyId is present', async () => {
      writeLogSpy.mockRestore();
      const writer = interceptor as unknown as {
        writeAuditLog: (data: Record<string, unknown>) => Promise<void>;
      };

      await writer.writeAuditLog({
        companyId: 'company-001',
        userId: 'user-001',
        action: 'employees.create',
        resource: 'employees',
        resourceId: 'employee-001',
        after: { firstName: 'Jane' },
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
        traceId: 'trace-abc123',
      });

      expect(prisma.unscopedClient.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: 'company-001',
          action: 'employees.create',
          after: { firstName: 'Jane' },
        }),
      });
    });

    it('does not persist an audit log when companyId is empty', async () => {
      writeLogSpy.mockRestore();
      const writer = interceptor as unknown as {
        writeAuditLog: (data: Record<string, unknown>) => Promise<void>;
      };

      await writer.writeAuditLog({
        companyId: '',
        action: 'employees.create',
        resource: 'employees',
      });

      expect(prisma.unscopedClient.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
