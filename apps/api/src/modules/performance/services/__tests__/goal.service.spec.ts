import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GoalService } from '../goal.service';
import { makeGoal } from '../../../../../../../test/factories/sprint8.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('GoalService', () => {
  let service: GoalService;
  let mockPrisma: any;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };

  function stubGoal(overrides: Record<string, unknown> = {}) { return makeGoal(overrides); }

  beforeEach(async () => {
    mockEvents = { emit: vi.fn() };

    mockPrisma = {
      unscopedClient: {
        performanceGoal: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'goal-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ ...args.data })),
        },
        goalCheckIn: {
          create: vi.fn().mockImplementation((args: any) => ({ id: 'ci-001', ...args.data })),
        },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();

    service = module.get(GoalService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── Parent-child alignment ─────────────────────────────────────────

  describe('createGoal — parent-child', () => {
    it('succeeds with valid parentGoalId', async () => {
      mockPrisma.unscopedClient.performanceGoal.findUnique.mockResolvedValue(makeGoal({ id: 'parent-1' }));
      const result = await service.createGoal({ employeeId: 'emp-1', title: 'Child', parentGoalId: 'parent-1' });
      expect(result.parentGoalId).toBe('parent-1');
    });

    it('throws NotFoundException for non-existent parent', async () => {
      mockPrisma.unscopedClient.performanceGoal.findUnique.mockResolvedValue(null);
      await expect(service.createGoal({ employeeId: 'emp-1', title: 'Orphan', parentGoalId: 'bad-id' })).rejects.toThrow(NotFoundException);
    });

    it('rejects cyclic parent reference', async () => {
      // Goal claims parent is itself
      mockPrisma.unscopedClient.performanceGoal.findUnique.mockResolvedValue(makeGoal({ id: 'self-ref', parentGoalId: 'self-ref' }));
      await expect(service.createGoal({ employeeId: 'emp-1', title: 'Cycle', parentGoalId: 'self-ref' })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── OKR tree ───────────────────────────────────────────────────────

  describe('getOkrTree', () => {
    it('returns flat list when no children', async () => {
      mockPrisma.unscopedClient.performanceGoal.findMany.mockResolvedValue([makeGoal()]);
      const result = await service.getOkrTree('emp-1');
      expect(result).toHaveLength(1);
    });

    it('returns empty array for employee with no goals', async () => {
      mockPrisma.unscopedClient.performanceGoal.findMany.mockResolvedValue([]);
      const result = await service.getOkrTree('emp-1');
      expect(result).toEqual([]);
    });
  });

  // ─── Check-in / progress ────────────────────────────────────────────

  describe('postCheckIn', () => {
    it('creates checkIn and updates currentValue in transaction', async () => {
      await service.postCheckIn('goal-001', { postedBy: 'emp-1', progressNote: 'On track', valueAtCheckIn: 42 }, 'ON_TRACK');
      expect(mockPrisma.unscopedClient.goalCheckIn.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.unscopedClient.performanceGoal.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currentValue: 42 }) }));
    });

    it('emits goal.checked_in event', async () => {
      await service.postCheckIn('goal-001', { postedBy: 'emp-1', progressNote: 'Done', valueAtCheckIn: 100 });
      expect(mockEvents.emit).toHaveBeenCalledWith('goal.checked_in', expect.objectContaining({ goalId: 'goal-001' }));
    });
  });

  // ─── Progress percentage ────────────────────────────────────────────

  describe('progress percentage', () => {
    it('returns 0 for 0/100', () => {
      expect(computeProgress(0, 100)).toBe(0);
    });

    it('returns 50 for 50/100', () => {
      expect(computeProgress(50, 100)).toBe(50);
    });

    it('returns 100 for 100/100', () => {
      expect(computeProgress(100, 100)).toBe(100);
    });

    it('caps at 100 for over-achievement', () => {
      expect(computeProgress(150, 100)).toBe(100);
    });

    it('returns null for targetValue=0', () => {
      expect(computeProgress(50, 0)).toBeNull();
    });
  });

  // ─── Update goal ────────────────────────────────────────────────────

  describe('updateGoal', () => {
    it('throws NotFoundException when goal missing', async () => {
      mockPrisma.unscopedClient.performanceGoal.findUnique.mockResolvedValue(null);
      await expect(service.updateGoal('bad-id', { title: 'New' })).rejects.toThrow(NotFoundException);
    });

    it('updates goal fields', async () => {
      mockPrisma.unscopedClient.performanceGoal.findUnique.mockResolvedValue(makeGoal());
      const result = await service.updateGoal('goal-001', { title: 'Updated', status: 'ON_TRACK' });
      expect(result.title).toBe('Updated');
    });
  });
});

// Helper for progress percentage (not yet in service — TODO: add as exported function)
function computeProgress(current: number, target: number): number | null {
  if (target <= 0) return null;
  return Math.min(100, Math.round((current / target) * 100));
}
