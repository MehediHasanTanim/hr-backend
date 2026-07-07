import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../../../modules/audit/audit.service';
import { TrainingAssignmentService } from '../training-assignment.service';
import { makeTrainingAssignment, makeEnrollment } from '../../../../../../../test/factories/sprint9.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('TrainingAssignmentService', () => {
  let service: TrainingAssignmentService;
  let mockPrisma: any;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };
  let mockAudit: { logAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockEvents = { emit: vi.fn() };
    mockAudit = { logAsync: vi.fn().mockResolvedValue(undefined) };

    mockPrisma = {
      unscopedClient: {
        trainingAssignment: {
          findUnique: vi.fn().mockResolvedValue(makeTrainingAssignment()),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'ta-001', ...args.data })),
        },
        courseEnrollment: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'enr-001', ...args.data })),
          count: vi.fn().mockResolvedValue(5),
        },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingAssignmentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(TrainingAssignmentService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── Bulk Assign ────────────────────────────────────────────────────

  describe('bulkAssign', () => {
    const baseDto = {
      companyId: 'comp-1', targetType: 'COURSE', targetId: 'course-001',
      scopeType: 'EMPLOYEE', scopeFilter: { employeeIds: ['emp-1', 'emp-2', 'emp-3'] },
      deadlineAt: new Date('2026-08-01'), isMandatory: true,
      reminderScheduleDaysBeforeDeadline: [14, 7, 1], assignedById: 'admin-1',
    };

    it('creates assignment and enrollments for all employees', async () => {
      const result = await service.bulkAssign(baseDto);
      expect(result.affectedEmployeeCount).toBe(3);
      expect(mockPrisma.unscopedClient.trainingAssignment.create).toHaveBeenCalled();
      expect(mockPrisma.unscopedClient.courseEnrollment.create).toHaveBeenCalledTimes(3);
    });

    it('skips already-enrolled employees (idempotency)', async () => {
      // Employee 1 already enrolled
      mockPrisma.unscopedClient.courseEnrollment.findUnique
        .mockResolvedValueOnce(makeEnrollment())  // emp-1 → already enrolled
        .mockResolvedValueOnce(null)               // emp-2 → not enrolled
        .mockResolvedValueOnce(null);              // emp-3 → not enrolled

      const result = await service.bulkAssign(baseDto);
      expect(result.affectedEmployeeCount).toBe(2);
    });

    it('emits training.assigned event per batch', async () => {
      await service.bulkAssign(baseDto);
      expect(mockEvents.emit).toHaveBeenCalledWith('training.assigned', expect.objectContaining({ courseId: 'course-001' }));
    });

    it('audit log fires for mandatory assignments', async () => {
      await service.bulkAssign(baseDto);
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MANDATORY_TRAINING_ASSIGNED', entityType: 'TrainingAssignment' }),
      );
    });

    it('no audit log for non-mandatory assignments', async () => {
      await service.bulkAssign({ ...baseDto, isMandatory: false });
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).not.toHaveBeenCalled();
    });

    it('handles empty employee list gracefully', async () => {
      const result = await service.bulkAssign({ ...baseDto, scopeFilter: { employeeIds: [] } });
      expect(result.affectedEmployeeCount).toBe(0);
    });
  });

  // ─── Schedule Deadline Reminders ────────────────────────────────────

  describe('scheduleDeadlineReminders', () => {
    it('emits events for each reminder day', async () => {
      mockPrisma.unscopedClient.trainingAssignment.findUnique.mockResolvedValue(
        makeTrainingAssignment({ reminderScheduleDaysBeforeDeadline: [14, 7, 1] }),
      );
      await service.scheduleDeadlineReminders('ta-001');
      expect(mockEvents.emit).toHaveBeenCalledTimes(3);
      expect(mockEvents.emit).toHaveBeenCalledWith('training.deadline_reminder_scheduled', expect.objectContaining({ daysBeforeDeadline: 14 }));
    });

    it('throws NotFoundException for missing assignment', async () => {
      mockPrisma.unscopedClient.trainingAssignment.findUnique.mockResolvedValue(null);
      await expect(service.scheduleDeadlineReminders('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Compliance Status ──────────────────────────────────────────────

  describe('getComplianceStatus', () => {
    it('returns aggregate counts', async () => {
      mockPrisma.unscopedClient.trainingAssignment.findUnique.mockResolvedValue(makeTrainingAssignment());
      const result = await service.getComplianceStatus('ta-001');
      expect(result).toEqual({ completed: 5, pending: 5, overdue: 5 });
    });

    it('throws NotFoundException for missing assignment', async () => {
      mockPrisma.unscopedClient.trainingAssignment.findUnique.mockResolvedValue(null);
      await expect(service.getComplianceStatus('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
