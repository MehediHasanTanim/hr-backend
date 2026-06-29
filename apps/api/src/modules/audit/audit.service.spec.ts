import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuditService } from './audit.service';
import type { RequestContext } from '../../common/context/request-context';

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */

const actor: RequestContext = {
  userId: '22222222-2222-4222-8222-222222222222',
  companyId: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.test',
  roles: ['admin'],
  permissions: ['employee:write'],
  sessionId: 'session-1',
  traceId: 'trace-1',
};

function createPrismaMock() {
  return {
    unscopedClient: {
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    },
  };
}

describe('AuditService', () => {
  let service: AuditService;
  let mockPrisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createPrismaMock();
    service = new AuditService(mockPrisma as any);
  });

  // Existing preserved tests
  it('persists audit log with actor, resource, values, and trace metadata', async () => {
    await service.record({
      actor,
      companyId: actor.companyId,
      entityType: 'employee',
      entityId: '33333333-3333-4333-8333-333333333333',
      action: 'EMPLOYEE_UPDATED',
      oldValue: { status: 'ACTIVE' },
      newValue: { status: 'TERMINATED' },
    });

    expect(mockPrisma.unscopedClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        companyId: actor.companyId,
        userId: actor.userId,
        action: 'EMPLOYEE_UPDATED',
        resource: 'employee',
        resourceId: '33333333-3333-4333-8333-333333333333',
        before: { status: 'ACTIVE' },
        after: { status: 'TERMINATED' },
        traceId: actor.traceId,
      },
    });
  });

  it('omits optional actor metadata for system actions', async () => {
    await service.record({
      companyId: actor.companyId,
      entityType: 'employee',
      entityId: '33333333-3333-4333-8333-333333333333',
      action: 'EMPLOYEE_DELETED',
      oldValue: { deletedAt: null },
      newValue: { deletedAt: '2026-05-28T00:00:00.000Z' },
    });

    expect(mockPrisma.unscopedClient.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: actor.companyId,
        userId: undefined,
        action: 'EMPLOYEE_DELETED',
        resource: 'employee',
        traceId: undefined,
      }),
    });
  });

  // =====================================================================
  // Test Group 1: Non-blocking async write (logAsync)
  // =====================================================================
  describe('logAsync — fire-and-forget', () => {
    it('resolves before DB write completes — returns instantly', async () => {
      let resolveDbWrite!: () => void;
      mockPrisma.unscopedClient.auditLog.create.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveDbWrite = resolve;
        }),
      );

      const startTime = Date.now();
      service.logAsync({
        actor,
        companyId: actor.companyId,
        entityType: 'employee_document',
        action: 'DOCUMENT_SIGNED_URL_GENERATED',
        newValue: { documentId: 'doc-uuid-1', requesterId: actor.userId },
      });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(50);

      resolveDbWrite!();
      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.unscopedClient.auditLog.create).toHaveBeenCalled();
    });

    it('async write failure does not propagate to caller', async () => {
      mockPrisma.unscopedClient.auditLog.create.mockRejectedValue(
        new Error('DB connection lost'),
      );

      expect(() =>
        service.logAsync({
          actor,
          companyId: actor.companyId,
          entityType: 'esign_request',
          action: 'ESIGN_REQUEST_EXPIRED',
        }),
      ).not.toThrow();

      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.unscopedClient.auditLog.create).toHaveBeenCalled();
    });
  });

  // =====================================================================
  // Test Group 2: Required fields presence
  // =====================================================================
  describe('required fields presence', () => {
    it('all required fields present for ESIGN_DOCUMENT_SIGNED', async () => {
      await service.record({
        actor,
        companyId: actor.companyId,
        entityType: 'esign_request',
        entityId: 'esign-uuid-1',
        action: 'ESIGN_DOCUMENT_SIGNED',
        newValue: {
          requestId: 'esign-uuid-1',
          documentId: 'doc-uuid-1',
          signerEmployeeId: 'emp-uuid-1',
          documentSha256AtSign: 'abc123',
        },
      });

      const d = mockPrisma.unscopedClient.auditLog.create.mock.calls[0][0].data;
      expect(d.action).toBe('ESIGN_DOCUMENT_SIGNED');
      expect(d.userId).toBe(actor.userId);
      expect(d.resource).toBe('esign_request');
      expect(d.resourceId).toBe('esign-uuid-1');
      expect(d.after.documentSha256AtSign).toBe('abc123');
      expect(d.traceId).toBe(actor.traceId);
    });

    it('all required fields present for POLICY_PUBLISHED', async () => {
      await service.record({
        actor,
        companyId: actor.companyId,
        entityType: 'policy',
        entityId: 'policy-uuid-1',
        action: 'POLICY_PUBLISHED',
        newValue: { policyId: 'policy-uuid-1', version: 3 },
      });

      const d = mockPrisma.unscopedClient.auditLog.create.mock.calls[0][0].data;
      expect(d.action).toBe('POLICY_PUBLISHED');
      expect(d.resource).toBe('policy');
      expect(d.resourceId).toBe('policy-uuid-1');
      expect(d.after.version).toBe(3);
    });

    it('all required fields present for DOCUMENT_UPLOADED', async () => {
      await service.record({
        actor,
        companyId: actor.companyId,
        entityType: 'employee_document',
        entityId: 'doc-uuid-1',
        action: 'DOCUMENT_UPLOADED',
        newValue: {
          employeeId: 'emp-uuid-1',
          category: 'CONTRACT',
          version: 2,
          sha256Hash: 'a'.repeat(64),
        },
      });

      const d = mockPrisma.unscopedClient.auditLog.create.mock.calls[0][0].data;
      expect(d.action).toBe('DOCUMENT_UPLOADED');
      expect(d.after.employeeId).toBe('emp-uuid-1');
      expect(d.after.category).toBe('CONTRACT');
      expect(d.after.version).toBe(2);
      expect(d.after.sha256Hash).toBe('a'.repeat(64));
    });

    it('all required fields present for AUDIT_EXPORT_QUEUED', async () => {
      await service.record({
        actor,
        companyId: actor.companyId,
        entityType: 'audit_export',
        action: 'AUDIT_EXPORT_QUEUED',
        newValue: { jobId: 'job-uuid-1', requestedBy: actor.userId, filters: { action: 'POLICY_PUBLISHED' } },
      });

      const d = mockPrisma.unscopedClient.auditLog.create.mock.calls[0][0].data;
      expect(d.action).toBe('AUDIT_EXPORT_QUEUED');
      expect(d.after.jobId).toBe('job-uuid-1');
      expect(d.after.filters).toEqual({ action: 'POLICY_PUBLISHED' });
    });
  });

  // =====================================================================
  // Test Group 3: PII exclusion from metadata / new_values
  // =====================================================================
  describe('PII exclusion', () => {
    it('base64Signature excluded from ESIGN_DOCUMENT_SIGNED audit metadata', async () => {
      await service.record({
        actor,
        companyId: actor.companyId,
        entityType: 'esign_request',
        entityId: 'esign-uuid-1',
        action: 'ESIGN_DOCUMENT_SIGNED',
        newValue: {
          requestId: 'x',
          documentId: 'y',
          signerEmployeeId: 'z',
          documentSha256AtSign: 'abc',
          base64Signature: 'data:image/png;base64,AAAA...',
        },
      });

      const after = mockPrisma.unscopedClient.auditLog.create.mock.calls[0][0].data.after;
      expect(after).not.toHaveProperty('base64Signature');
      expect(after).toHaveProperty('documentSha256AtSign');
      expect(after).toHaveProperty('requestId');
    });

    it('passwordHash excluded from audit metadata', async () => {
      await service.record({
        actor,
        companyId: actor.companyId,
        entityType: 'user',
        action: 'USER_REGISTERED',
        newValue: { userId: 'x', email: 'test@co.com', passwordHash: 'hashed_value' },
      });

      const after = mockPrisma.unscopedClient.auditLog.create.mock.calls[0][0].data.after;
      expect(after).not.toHaveProperty('passwordHash');
      expect(after).toHaveProperty('email');
      expect(after).toHaveProperty('userId');
    });

    it('otpCode excluded from audit metadata', async () => {
      await service.record({
        actor,
        companyId: actor.companyId,
        entityType: 'user',
        action: 'OTP_VERIFIED',
        newValue: { userId: 'x', otpCode: '123456' },
      });

      const after = mockPrisma.unscopedClient.auditLog.create.mock.calls[0][0].data.after;
      expect(after).not.toHaveProperty('otpCode');
    });

    it('rawToken excluded from audit metadata', async () => {
      await service.record({
        actor,
        companyId: actor.companyId,
        entityType: 'session',
        action: 'SESSION_CREATED',
        newValue: { sessionId: 'x', rawToken: 'eyJhbGciOi...' },
      });

      const after = mockPrisma.unscopedClient.auditLog.create.mock.calls[0][0].data.after;
      expect(after).not.toHaveProperty('rawToken');
    });

    it('signedUrl excluded from audit metadata', async () => {
      await service.record({
        actor,
        companyId: actor.companyId,
        entityType: 'employee_document',
        action: 'DOCUMENT_SIGNED_URL_GENERATED',
        newValue: {
          documentId: 'x',
          requesterId: 'y',
          signedUrl: 'https://s3.amazonaws.com/bucket/key?X-Amz-Signature=...',
        },
      });

      const after = mockPrisma.unscopedClient.auditLog.create.mock.calls[0][0].data.after;
      expect(after).not.toHaveProperty('signedUrl');
      expect(after).toHaveProperty('documentId');
      expect(after).toHaveProperty('requesterId');
    });

    it('PII stripping is shallow — does not recurse into nested objects', async () => {
      await service.record({
        actor,
        companyId: actor.companyId,
        entityType: 'test',
        action: 'ANY_ACTION',
        newValue: {
          topLevel: 'safe',
          nested: { base64Signature: 'should_survive_if_nested' },
        },
      });

      const after = mockPrisma.unscopedClient.auditLog.create.mock.calls[0][0].data.after;
      expect(after.topLevel).toBe('safe');
      expect(after.nested).toEqual({ base64Signature: 'should_survive_if_nested' });
    });
  });

  // =====================================================================
  // Test Group: stripPii public method
  // =====================================================================
  describe('stripPii', () => {
    it('removes all PII fields from flat object', () => {
      const result = service.stripPii({
        name: 'safe',
        base64Signature: 'top-secret',
        passwordHash: 'hash',
        otpCode: '123456',
        rawToken: 'token',
        signedUrl: 'https://...',
        normalField: 'ok',
      });

      expect(result).toEqual({ name: 'safe', normalField: 'ok' });
    });

    it('returns empty object for empty input', () => {
      expect(service.stripPii({})).toEqual({});
    });

    it('returns same object if no PII fields present', () => {
      const input = { action: 'LOGIN', userId: 'u1' };
      expect(service.stripPii(input)).toEqual(input);
    });
  });
});
