import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@hr/prisma';
import { AuditLogQueryService } from '../audit-log-query.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('AuditLogQueryService', () => {
  let service: AuditLogQueryService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        auditLog: {
          findMany: vi.fn().mockResolvedValue([{ id: 'al-1', action: 'login', resource: 'user', resourceId: 'user-1' }]),
          count: vi.fn().mockResolvedValue(1),
        },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditLogQueryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(AuditLogQueryService);
  });

  afterEach(() => vi.clearAllMocks());

  it('queries audit logs for company', async () => {
    const result = await service.query({}, 'comp-1');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].action).toBe('login');
  });

  it('filters by actorId', async () => {
    await service.query({ actorId: 'user-1' }, 'comp-1');
    const call = mockPrisma.unscopedClient.auditLog.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe('user-1');
  });

  it('filters by resourceType', async () => {
    await service.query({ resourceType: 'employee' }, 'comp-1');
    const call = mockPrisma.unscopedClient.auditLog.findMany.mock.calls[0][0];
    expect(call.where.resource).toBe('employee');
  });

  it('filters by action', async () => {
    await service.query({ action: 'login' }, 'comp-1');
    const call = mockPrisma.unscopedClient.auditLog.findMany.mock.calls[0][0];
    expect(call.where.action).toBe('login');
  });

  it('always includes companyId in where clause', async () => {
    await service.query({}, 'comp-1');
    const call = mockPrisma.unscopedClient.auditLog.findMany.mock.calls[0][0];
    expect(call.where.companyId).toBe('comp-1');
  });
});
