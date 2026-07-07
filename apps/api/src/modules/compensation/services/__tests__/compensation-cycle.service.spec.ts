import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CompensationCycleService } from '../compensation-cycle.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('CompensationCycleService', () => {
  let service: CompensationCycleService;
  let mockPrisma: any;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };

  const mockCycle = { id: 'cc-001', companyId: 'comp-1', name: 'FY2026 Bonus', status: 'PLANNING', totalBudget: 100000, allocatedTotal: 0, allocations: [] };

  beforeEach(async () => {
    mockEvents = { emit: vi.fn() };
    mockPrisma = {
      unscopedClient: {
        compensationCycle: {
          findUnique: vi.fn().mockResolvedValue(mockCycle),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'cc-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ ...mockCycle, ...args.data })),
        },
        compensationAllocation: {
          findUnique: vi.fn().mockResolvedValue({ id: 'a-1', status: 'PROPOSED', proposedAmount: 5000 }),
          update: vi.fn().mockImplementation((args: any) => ({ id: args.where.id, ...args.data })),
          aggregate: vi.fn().mockResolvedValue({ _sum: { proposedAmount: 50000 } }),
        },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompensationCycleService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();

    service = module.get(CompensationCycleService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── State Machine ──────────────────────────────────────────────────

  describe('state machine transitions', () => {
    it('PLANNING → OPEN', async () => {
      await service.open('cc-001');
      expect(mockPrisma.unscopedClient.compensationCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'OPEN' }) }),
      );
    });

    it('OPEN → APPROVAL (budget passes)', async () => {
      mockPrisma.unscopedClient.compensationCycle.findUnique.mockResolvedValue({ ...mockCycle, status: 'OPEN', totalBudget: 100000 });
      mockPrisma.unscopedClient.compensationAllocation.aggregate.mockResolvedValue({ _sum: { proposedAmount: 80000 } });
      await service.lockForApproval('cc-001');
      expect(mockPrisma.unscopedClient.compensationCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVAL' }) }),
      );
    });

    it('OPEN → APPROVAL blocked when over budget', async () => {
      mockPrisma.unscopedClient.compensationCycle.findUnique.mockResolvedValue({ ...mockCycle, status: 'OPEN', totalBudget: 100000 });
      mockPrisma.unscopedClient.compensationAllocation.aggregate.mockResolvedValue({ _sum: { proposedAmount: 150000 } });
      await expect(service.lockForApproval('cc-001')).rejects.toThrow(BadRequestException);
    });

    it('rejects OPEN when not PLANNING', async () => {
      mockPrisma.unscopedClient.compensationCycle.findUnique.mockResolvedValue({ ...mockCycle, status: 'APPROVAL' });
      await expect(service.open('cc-001')).rejects.toThrow(BadRequestException);
    });

    it('can cancel a PLANNING cycle', async () => {
      await service.cancel('cc-001', 'No longer needed');
      expect(mockPrisma.unscopedClient.compensationCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } }),
      );
    });

    it('rejects cancel on DISBURSED cycle', async () => {
      mockPrisma.unscopedClient.compensationCycle.findUnique.mockResolvedValue({ ...mockCycle, status: 'DISBURSED' });
      await expect(service.cancel('cc-001', 'Test')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for missing cycle', async () => {
      mockPrisma.unscopedClient.compensationCycle.findUnique.mockResolvedValue(null);
      await expect(service.open('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Allocations ────────────────────────────────────────────────────

  describe('allocation management', () => {
    it('approves allocation with amount', async () => {
      const result = await service.approveAllocation('a-1', 5000, 'mgr-1');
      expect(result.status).toBe('APPROVED');
    });

    it('rejects non-PROPOSED allocation', async () => {
      mockPrisma.unscopedClient.compensationAllocation.findUnique.mockResolvedValue({ id: 'a-1', status: 'APPROVED' });
      await expect(service.approveAllocation('a-1', 5000, 'mgr-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects allocation', async () => {
      const result = await service.rejectAllocation('a-1', 'mgr-1', 'Over budget');
      expect(result.status).toBe('REJECTED');
    });
  });

  // ─── Disburse ───────────────────────────────────────────────────────

  describe('disburse', () => {
    it('disburses cycle and emits bonus.disbursed events', async () => {
      mockPrisma.unscopedClient.compensationCycle.findUnique.mockResolvedValue({
        ...mockCycle, status: 'APPROVAL',
        allocations: [
          { id: 'a-1', status: 'APPROVED', employeeId: 'emp-1', approvedAmount: 5000 },
          { id: 'a-2', status: 'REJECTED', employeeId: 'emp-2', proposedAmount: 3000 },
        ],
      });
      await service.disburse('cc-001', 'admin-1');
      expect(mockEvents.emit).toHaveBeenCalledWith('bonus.disbursed', expect.objectContaining({ allocationId: 'a-1' }));
    });

    it('rejects disburse when PROPOSED allocations remain', async () => {
      mockPrisma.unscopedClient.compensationCycle.findUnique.mockResolvedValue({
        ...mockCycle, status: 'APPROVAL',
        allocations: [{ id: 'a-1', status: 'PROPOSED', employeeId: 'emp-1', proposedAmount: 5000 }],
      });
      await expect(service.disburse('cc-001', 'admin-1')).rejects.toThrow(BadRequestException);
    });
  });
});
