import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../../../modules/audit/audit.service';
import { AttritionRiskScoringService } from '../attrition-risk.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('AttritionRiskScoringService', () => {
  let service: AttritionRiskScoringService;
  let mockPrisma: any;
  let mockAudit: { logAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockAudit = { logAsync: vi.fn().mockResolvedValue(undefined) };

    mockPrisma = {
      unscopedClient: {
        employee: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'emp-1', joinedAt: new Date('2020-01-01') },
            { id: 'emp-2', joinedAt: new Date('2025-11-01') },
          ]),
        },
        attritionRiskScore: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttritionRiskScoringService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(AttritionRiskScoringService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('recomputeAllActive', () => {
    it('processes all active employees', async () => {
      const result = await service.recomputeAllActive();
      expect(result.processedCount).toBe(2);
    });

    it('flips isLatest on prior scores before inserting new one', async () => {
      await service.recomputeAllActive();
      // For each employee: updateMany (flip isLatest) + create (new score)
      expect(mockPrisma.unscopedClient.attritionRiskScore.updateMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.unscopedClient.attritionRiskScore.create).toHaveBeenCalledTimes(2);
    });

    it('new score has isLatest = true', async () => {
      await service.recomputeAllActive();
      const createCall = mockPrisma.unscopedClient.attritionRiskScore.create.mock.calls[0][0];
      expect(createCall.data.isLatest).toBe(true);
    });

    it('new score has computedAt set', async () => {
      await service.recomputeAllActive();
      const createCall = mockPrisma.unscopedClient.attritionRiskScore.create.mock.calls[0][0];
      expect(createCall.data.computedAt).toBeDefined();
    });

    it('sets riskBand from computed score', async () => {
      await service.recomputeAllActive();
      const createCall = mockPrisma.unscopedClient.attritionRiskScore.create.mock.calls[0][0];
      const signals = createCall.data.signals;
      expect(signals.riskBand).toBeDefined();
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(signals.riskBand);
    });

    it('audit log fires with batch summary', async () => {
      await service.recomputeAllActive();
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTRITION_RISK_RECOMPUTED',
          newValue: expect.objectContaining({ employeesProcessed: 2 }),
        }),
      );
    });

    it('handles empty active employee list', async () => {
      mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([]);
      const result = await service.recomputeAllActive();
      expect(result.processedCount).toBe(0);
      expect(mockPrisma.unscopedClient.attritionRiskScore.create).not.toHaveBeenCalled();
    });

    it('flip + insert runs inside single transaction per employee', async () => {
      await service.recomputeAllActive();
      // 2 employees → 2 transactions
      expect(mockPrisma.unscopedClient.$transaction).toHaveBeenCalledTimes(2);
    });

    it('flip uses correct employee filter', async () => {
      await service.recomputeAllActive();
      const flipCall = mockPrisma.unscopedClient.attritionRiskScore.updateMany.mock.calls[0][0];
      expect(flipCall.where.employeeId).toBe('emp-1');
      expect(flipCall.where.isLatest).toBe(true);
    });
  });

  describe('getLatestForEmployee', () => {
    it('returns latest score for employee', async () => {
      mockPrisma.unscopedClient.attritionRiskScore.findFirst.mockResolvedValue({
        id: 'score-1', employeeId: 'emp-1', riskScore: 65, riskBand: 'HIGH', isLatest: true,
      });
      const result = await service.getLatestForEmployee('emp-1');
      expect(result.riskBand).toBe('HIGH');
    });

    it('returns null when no score exists', async () => {
      mockPrisma.unscopedClient.attritionRiskScore.findFirst.mockResolvedValue(null);
      const result = await service.getLatestForEmployee('emp-1');
      expect(result).toBeNull();
    });
  });
});
