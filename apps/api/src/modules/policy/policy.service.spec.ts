import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyService } from './policy.service';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  makePolicy,
  makePolicyAcknowledgement,
  makeMockRequestContext,
} from '../../common/test/factories';
import {
  POLICY_PUBLISHED,
  AUDIT_ACTIONS,
} from '../../common/events/hr-events.constants';

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */

function createMockPrisma() {
  const scoped: Record<string, any> = {
    policy: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    policyAcknowledgement: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    employee: {
      count: vi.fn(),
    },
    $transaction: vi.fn((cbOrArr: any) => {
      if (typeof cbOrArr === 'function') return cbOrArr(scoped);
      return Promise.all(cbOrArr);
    }),
  };
  return { unscopedClient: scoped } as any;
}

describe('PolicyService', () => {
  let service: PolicyService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAudit: { record: ReturnType<typeof vi.fn> };
  let mockEvents: { emit: ReturnType<typeof vi.fn> };
  const mockUser = makeMockRequestContext();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudit = { record: vi.fn().mockResolvedValue(undefined) };
    mockEvents = { emit: vi.fn() };
    mockPrisma = createMockPrisma();

    service = new PolicyService(
      mockPrisma as any,
      mockAudit as any,
      mockEvents as any,
    );
  });

  // =====================================================================
  // Test Group 1: listPolicies — visibility by role
  // =====================================================================
  describe('listPolicies', () => {
    it('non-admin employees see only PUBLISHED policies', async () => {
      mockPrisma.unscopedClient.policy.findMany.mockResolvedValue([
        makePolicy({ status: 'PUBLISHED' }),
      ]);

      await service.listPolicies(mockUser.companyId, undefined, false);

      expect(mockPrisma.unscopedClient.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED' }),
        }),
      );
    });

    it('HR_ADMIN sees all statuses', async () => {
      mockPrisma.unscopedClient.policy.findMany.mockResolvedValue([
        makePolicy({ status: 'DRAFT' }),
        makePolicy({ status: 'PUBLISHED' }),
        makePolicy({ status: 'ARCHIVED' }),
      ]);

      const result = await service.listPolicies(mockUser.companyId, undefined, true);

      expect(result).toHaveLength(3);
      expect(mockPrisma.unscopedClient.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ status: expect.anything() }),
        }),
      );
    });

    it('ARCHIVED policies excluded from employee view', async () => {
      mockPrisma.unscopedClient.policy.findMany.mockResolvedValue([
        makePolicy({ status: 'PUBLISHED' }),
      ]);

      const result = await service.listPolicies(mockUser.companyId, undefined, false);

      expect(result).toHaveLength(1);
      expect(
        mockPrisma.unscopedClient.policy.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED' }),
        }),
      );
    });
  });

  // =====================================================================
  // Test Group 2: publishPolicy — state transition and event
  // =====================================================================
  describe('publishPolicy', () => {
    it('happy path transitions DRAFT to PUBLISHED', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'DRAFT', version: 2 }),
      );
      mockPrisma.unscopedClient.policy.update.mockResolvedValue(
        makePolicy({
          status: 'PUBLISHED',
          version: 2,
          publishedBy: mockUser.userId,
          publishedAt: new Date(),
        }),
      );

      const result = await service.publishPolicy('policy-uuid-1', mockUser);

      expect(result.status).toBe('PUBLISHED');
      expect(result.publishedBy).toBe(mockUser.userId);
      expect(result.publishedAt).toBeInstanceOf(Date);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.POLICY_PUBLISHED,
          newValue: expect.objectContaining({
            policyId: 'policy-uuid-1',
            version: 2,
            publishedBy: mockUser.userId,
          }),
        }),
      );
    });

    it('emits hr.policy.published event after transaction commits', async () => {
      const callOrder: string[] = [];
      const publishedPolicy = makePolicy({
        status: 'PUBLISHED',
        version: 1,
        publishedBy: mockUser.userId,
        publishedAt: new Date(),
      });
      mockPrisma.unscopedClient.$transaction.mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) => {
          const result = await cb(mockPrisma.unscopedClient);
          callOrder.push('uow_committed');
          return result ?? publishedPolicy;
        },
      );
      mockEvents.emit.mockImplementation(() => {
        callOrder.push('event_emitted');
      });
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'DRAFT' }),
      );
      mockPrisma.unscopedClient.policy.update.mockResolvedValue(publishedPolicy);

      await service.publishPolicy('policy-uuid-1', mockUser);

      expect(callOrder).toEqual(['uow_committed', 'event_emitted']);
      expect(mockEvents.emit).toHaveBeenCalledWith(
        POLICY_PUBLISHED,
        expect.objectContaining({ policyId: 'policy-uuid-1' }),
      );
    });

    it('throws BadRequestException when publishing already PUBLISHED policy', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'PUBLISHED' }),
      );

      await expect(
        service.publishPolicy('policy-uuid-1', mockUser),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.unscopedClient.policy.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when publishing ARCHIVED policy', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'ARCHIVED' }),
      );

      await expect(
        service.publishPolicy('policy-uuid-1', mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =====================================================================
  // Test Group 3: acknowledgePolicy
  // =====================================================================
  describe('acknowledgePolicy', () => {
    it('happy path creates acknowledgement record', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'PUBLISHED' }),
      );
      mockPrisma.unscopedClient.policyAcknowledgement.findUnique.mockResolvedValue(null);
      mockPrisma.unscopedClient.policyAcknowledgement.create.mockResolvedValue(
        makePolicyAcknowledgement(),
      );

      const result = await service.acknowledgePolicy('policy-uuid-1', mockUser);

      expect(result).toHaveProperty('policyId', 'policy-uuid-1');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AUDIT_ACTIONS.POLICY_ACKNOWLEDGED }),
      );
    });

    it('idempotent — returns existing record without inserting', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'PUBLISHED' }),
      );
      mockPrisma.unscopedClient.policyAcknowledgement.findUnique.mockResolvedValue(
        makePolicyAcknowledgement(),
      );

      const result = await service.acknowledgePolicy('policy-uuid-1', mockUser);

      expect(result.id).toBe('ack-uuid-1');
      expect(mockPrisma.unscopedClient.policyAcknowledgement.create).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when policy is not PUBLISHED', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'DRAFT' }),
      );

      await expect(
        service.acknowledgePolicy('policy-uuid-1', mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when policy does not exist', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(null);

      await expect(
        service.acknowledgePolicy('policy-uuid-1', mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =====================================================================
  // Test Group 4: getMandatoryAcknowledgementCount
  // =====================================================================
  describe('getMandatoryAcknowledgementCount', () => {
    it('returns correct acknowledged and pending counts', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'PUBLISHED' }),
      );
      mockPrisma.unscopedClient.policyAcknowledgement.count.mockResolvedValue(7);
      mockPrisma.unscopedClient.employee.count.mockResolvedValue(10);

      const result = await service.getMandatoryAcknowledgementCount(
        'policy-uuid-1',
        mockUser.companyId,
      );

      expect(result).toEqual({
        acknowledgedCount: 7,
        pendingCount: 3,
        totalEmployees: 10,
      });
    });

    it('returns zero pending when all acknowledged', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'PUBLISHED' }),
      );
      mockPrisma.unscopedClient.policyAcknowledgement.count.mockResolvedValue(10);
      mockPrisma.unscopedClient.employee.count.mockResolvedValue(10);

      const result = await service.getMandatoryAcknowledgementCount(
        'policy-uuid-1',
        mockUser.companyId,
      );

      expect(result).toEqual({
        acknowledgedCount: 10,
        pendingCount: 0,
        totalEmployees: 10,
      });
    });

    it('returns zero acknowledged when none yet', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'PUBLISHED' }),
      );
      mockPrisma.unscopedClient.policyAcknowledgement.count.mockResolvedValue(0);
      mockPrisma.unscopedClient.employee.count.mockResolvedValue(10);

      const result = await service.getMandatoryAcknowledgementCount(
        'policy-uuid-1',
        mockUser.companyId,
      );

      expect(result).toEqual({
        acknowledgedCount: 0,
        pendingCount: 10,
        totalEmployees: 10,
      });
    });

    it('count scoped to specific policy', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'PUBLISHED' }),
      );
      mockPrisma.unscopedClient.policyAcknowledgement.count.mockResolvedValue(5);
      mockPrisma.unscopedClient.employee.count.mockResolvedValue(20);

      await service.getMandatoryAcknowledgementCount('policy-uuid-1', mockUser.companyId);

      expect(mockPrisma.unscopedClient.policyAcknowledgement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ policyId: 'policy-uuid-1' }),
        }),
      );
    });
  });

  // =====================================================================
  // Test Group 5: updatePolicy
  // =====================================================================
  describe('updatePolicy', () => {
    it('throws BadRequestException when updating a PUBLISHED policy', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'PUBLISHED' }),
      );

      await expect(
        service.updatePolicy('policy-uuid-1', { title: 'New Title' }, mockUser),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.unscopedClient.policy.update).not.toHaveBeenCalled();
    });

    it('increments version on each update', async () => {
      mockPrisma.unscopedClient.policy.findFirst.mockResolvedValue(
        makePolicy({ status: 'DRAFT', version: 2 }),
      );
      mockPrisma.unscopedClient.policy.update.mockResolvedValue(
        makePolicy({ status: 'DRAFT', version: 3 }),
      );

      const result = await service.updatePolicy(
        'policy-uuid-1',
        { title: 'New Title' },
        mockUser,
      );

      expect(result.version).toBe(3);
    });
  });
});
