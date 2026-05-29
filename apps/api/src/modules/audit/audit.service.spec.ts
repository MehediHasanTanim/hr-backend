import { describe, expect, it, vi } from 'vitest';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

import { AuditService } from './audit.service';
import type { RequestContext } from '../../common/context/request-context';

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
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    },
  };
}

describe('AuditService', () => {
  it('persists audit log actor, resource, values, and request metadata', async () => {
    const prisma = createPrismaMock();
    const service = new AuditService(prisma as never);

    await service.record({
      actor,
      companyId: actor.companyId,
      entityType: 'employee',
      entityId: '33333333-3333-4333-8333-333333333333',
      action: 'EMPLOYEE_UPDATED',
      oldValue: { status: 'ACTIVE' },
      newValue: { status: 'TERMINATED' },
    });

    expect(prisma.unscopedClient.auditLog.create).toHaveBeenCalledWith({
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
    const prisma = createPrismaMock();
    const service = new AuditService(prisma as never);

    await service.record({
      companyId: actor.companyId,
      entityType: 'employee',
      entityId: '33333333-3333-4333-8333-333333333333',
      action: 'EMPLOYEE_DELETED',
      oldValue: { deletedAt: null },
      newValue: { deletedAt: '2026-05-28T00:00:00.000Z' },
    });

    expect(prisma.unscopedClient.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: actor.companyId,
        userId: undefined,
        action: 'EMPLOYEE_DELETED',
        resource: 'employee',
        traceId: undefined,
      }),
    });
  });
});
