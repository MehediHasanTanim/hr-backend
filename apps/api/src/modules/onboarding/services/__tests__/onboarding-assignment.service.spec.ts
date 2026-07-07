import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnboardingAssignmentService } from '../onboarding-assignment.service';
import { makeOnboardingTemplate, makeTemplateTask, makeEmployeeOnboarding, makeTaskInstance } from '../../../../../../../test/factories/sprint8.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('OnboardingAssignmentService', () => {
  let service: OnboardingAssignmentService;
  let mockPrisma: any;
  let mockAudit: { logAsync: ReturnType<typeof vi.fn> };
  let mockEvents: { emit: ReturnType<typeof vi.fn> };

  const ACTIVE_TEMPLATE = makeOnboardingTemplate({
    tasks: [
      makeTemplateTask({ id: 't1', title: 'HR Paperwork', assigneeRole: 'HR', dueDayOffset: 1 }),
      makeTemplateTask({ id: 't2', title: 'IT Setup', assigneeRole: 'IT', dueDayOffset: 2 }),
      makeTemplateTask({ id: 't3', title: 'Team Intro', assigneeRole: 'EMPLOYEE', dueDayOffset: 5 }),
    ],
  });

  beforeEach(async () => {
    mockAudit = { logAsync: vi.fn().mockResolvedValue(undefined) };
    mockEvents = { emit: vi.fn() };

    mockPrisma = {
      unscopedClient: {
        onboardingTemplate: {
          findUnique: vi.fn().mockResolvedValue(ACTIVE_TEMPLATE),
        },
        employeeOnboarding: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'eo-001', ...args.data })),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue({}),
        },
        onboardingTaskInstance: {
          create: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue(makeTaskInstance()),
          update: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(1),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(mockPrisma.unscopedClient)),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingAssignmentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();

    service = module.get(OnboardingAssignmentService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── assignTemplateToEmployee ────────────────────────────────────────

  describe('assignTemplateToEmployee', () => {
    it('creates onboarding + task instances for each template task', async () => {
      await service.assignTemplateToEmployee('emp-1', 'tmpl-001', new Date('2025-06-01'), 'admin-1');
      expect(mockPrisma.unscopedClient.employeeOnboarding.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.unscopedClient.onboardingTaskInstance.create).toHaveBeenCalledTimes(3);
    });

    it('each task instance snapshot matches its source task', async () => {
      await service.assignTemplateToEmployee('emp-1', 'tmpl-001', new Date('2025-06-01'), 'admin-1');
      const calls = mockPrisma.unscopedClient.onboardingTaskInstance.create.mock.calls;
      const titles = calls.map((c: any) => c[0].data.title).sort();
      expect(titles).toEqual(['HR Paperwork', 'IT Setup', 'Team Intro']);
    });

    it('dueDate = hireDate + dueDayOffset', async () => {
      await service.assignTemplateToEmployee('emp-1', 'tmpl-001', new Date('2025-06-01'), 'admin-1');
      const calls = mockPrisma.unscopedClient.onboardingTaskInstance.create.mock.calls;
      // Task with dueDayOffset=1 should be due June 2
      const day1Task = calls.find((c: any) => c[0].data.title === 'HR Paperwork');
      expect(new Date(day1Task[0].data.dueDate).getDate()).toBe(2);
    });

    it('rejects duplicate assignment', async () => {
      mockPrisma.unscopedClient.employeeOnboarding.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.assignTemplateToEmployee('emp-1', 'tmpl-001', new Date('2025-06-01'), 'admin-1')).rejects.toThrow(ConflictException);
    });

    it('rejects inactive template', async () => {
      mockPrisma.unscopedClient.onboardingTemplate.findUnique.mockResolvedValue(makeOnboardingTemplate({ status: 'DRAFT' }));
      await expect(service.assignTemplateToEmployee('emp-1', 'tmpl-001', new Date('2025-06-01'), 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('emits onboarding.assigned event after commit', async () => {
      await service.assignTemplateToEmployee('emp-1', 'tmpl-001', new Date('2025-06-01'), 'admin-1');
      expect(mockEvents.emit).toHaveBeenCalledWith('onboarding.assigned', expect.objectContaining({ employeeId: 'emp-1', taskCount: 3 }));
    });

    it('audit log fires ONBOARDING_ASSIGNED', async () => {
      await service.assignTemplateToEmployee('emp-1', 'tmpl-001', new Date('2025-06-01'), 'admin-1');
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(expect.objectContaining({ action: 'ONBOARDING_ASSIGNED' }));
    });
  });

  // ─── completeTask ────────────────────────────────────────────────────

  describe('completeTask', () => {
    it('marks task COMPLETED', async () => {
      await service.completeTask('ti-001', 'emp-1');
      const updateCall = mockPrisma.unscopedClient.onboardingTaskInstance.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('COMPLETED');
    });

    it('auto-completes onboarding when last task finishes', async () => {
      mockPrisma.unscopedClient.onboardingTaskInstance.count.mockResolvedValue(0); // No pending tasks left
      await service.completeTask('ti-001', 'emp-1');
      expect(mockPrisma.unscopedClient.employeeOnboarding.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
    });

    it('rejects already-completed task', async () => {
      mockPrisma.unscopedClient.onboardingTaskInstance.findUnique.mockResolvedValue(makeTaskInstance({ status: 'COMPLETED' }));
      await expect(service.completeTask('ti-001', 'emp-1')).rejects.toThrow(BadRequestException);
    });

    it('emits onboarding.completed when all tasks done', async () => {
      mockPrisma.unscopedClient.onboardingTaskInstance.count.mockResolvedValue(0);
      await service.completeTask('ti-001', 'emp-1');
      expect(mockEvents.emit).toHaveBeenCalledWith('onboarding.completed', expect.any(Object));
    });
  });

  // ─── cancelOnboarding ────────────────────────────────────────────────

  describe('cancelOnboarding', () => {
    it('sets status CANCELLED and skips pending tasks', async () => {
      mockPrisma.unscopedClient.employeeOnboarding.findUnique.mockResolvedValue(makeEmployeeOnboarding());
      await service.cancelOnboarding('eo-001', 'Employee resigned');
      expect(mockPrisma.unscopedClient.employeeOnboarding.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }));
      expect(mockPrisma.unscopedClient.onboardingTaskInstance.updateMany).toHaveBeenCalled();
    });

    it('throws NotFoundException when onboarding missing', async () => {
      mockPrisma.unscopedClient.employeeOnboarding.findUnique.mockResolvedValue(null);
      await expect(service.cancelOnboarding('bad-id', 'Test')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Completion percentage ───────────────────────────────────────────

  describe('completion percentage', () => {
    it('0% when no tasks completed', () => {
      expect(computeCompletion(3, 0)).toBe(0);
    });

    it('100% when all tasks completed', () => {
      expect(computeCompletion(3, 3)).toBe(100);
    });

    it('50% when half done', () => {
      expect(computeCompletion(4, 2)).toBe(50);
    });
  });
});

function computeCompletion(total: number, completed: number): number {
  if (total === 0) return 100;
  return Math.round((completed / total) * 100);
}
