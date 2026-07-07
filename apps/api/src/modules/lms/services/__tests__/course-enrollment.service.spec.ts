import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { computeEnrollmentTransition, CourseEnrollmentService } from '../course-enrollment.service';
import { makeEnrollment, makeCourse } from '../../../../../../../test/factories/sprint9.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('CourseEnrollmentService', () => {
  let service: CourseEnrollmentService;
  let mockPrisma: any;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockEvents = { emit: vi.fn() };
    mockPrisma = {
      unscopedClient: {
        courseEnrollment: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'enr-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ ...args.data })),
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        learningPathCourse: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseEnrollmentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();

    service = module.get(CourseEnrollmentService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── Enroll ─────────────────────────────────────────────────────────

  describe('enroll', () => {
    it('creates enrollment successfully', async () => {
      const result = await service.enroll('course-001', 'emp-001');
      expect(result.courseId).toBe('course-001');
      expect(result.employeeId).toBe('emp-001');
    });

    it('rejects duplicate enrollment', async () => {
      mockPrisma.unscopedClient.courseEnrollment.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.enroll('course-001', 'emp-001')).rejects.toThrow(ConflictException);
    });
  });

  // ─── Update Progress ────────────────────────────────────────────────

  describe('updateProgress', () => {
    it('transitions NOT_STARTED → IN_PROGRESS on first progress', async () => {
      mockPrisma.unscopedClient.courseEnrollment.findUnique.mockResolvedValue(makeEnrollment());
      await service.updateProgress('enr-001', 50, 'emp-1');
      expect(mockPrisma.unscopedClient.courseEnrollment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS', progressPercent: 50 }) }));
    });

    it('rejects non-monotonic progress', async () => {
      mockPrisma.unscopedClient.courseEnrollment.findUnique.mockResolvedValue(makeEnrollment({ status: 'IN_PROGRESS', progressPercent: 60 }));
      await expect(service.updateProgress('enr-001', 30, 'emp-1')).rejects.toThrow(BadRequestException);
    });

    it('transitions to COMPLETED at 100%', async () => {
      mockPrisma.unscopedClient.courseEnrollment.findUnique.mockResolvedValue(makeEnrollment({ status: 'IN_PROGRESS', progressPercent: 90 }));
      await service.updateProgress('enr-001', 100, 'emp-1');
      expect(mockPrisma.unscopedClient.courseEnrollment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED', progressPercent: 100 }) }));
    });
  });

  // ─── Complete Course ────────────────────────────────────────────────

  describe('completeCourse', () => {
    it('completes and emits course.completed event', async () => {
      mockPrisma.unscopedClient.courseEnrollment.findUnique.mockResolvedValue(makeEnrollment({ status: 'IN_PROGRESS' }));
      await service.completeCourse('enr-001', 'emp-1');
      expect(mockEvents.emit).toHaveBeenCalledWith('course.completed', expect.objectContaining({ enrollmentId: 'enr-001' }));
    });

    it('rejects already-completed enrollment', async () => {
      mockPrisma.unscopedClient.courseEnrollment.findUnique.mockResolvedValue(makeEnrollment({ status: 'COMPLETED' }));
      await expect(service.completeCourse('enr-001', 'emp-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Property-Based: computeEnrollmentTransition ─────────────────────

  describe('computeEnrollmentTransition (pure function)', () => {
    it('NOT_STARTED + progress → IN_PROGRESS', () => {
      const result = computeEnrollmentTransition({ status: 'NOT_STARTED', progressPercent: 0 }, { type: 'UPDATE_PROGRESS', progressPercent: 30 });
      expect(result).toEqual({ status: 'IN_PROGRESS', progressPercent: 30, startedAt: 'now' });
    });

    it('IN_PROGRESS + 100 → COMPLETED', () => {
      const result = computeEnrollmentTransition({ status: 'IN_PROGRESS', progressPercent: 90 }, { type: 'UPDATE_PROGRESS', progressPercent: 100 });
      expect(result).toEqual({ status: 'COMPLETED', progressPercent: 100 });
    });

    it('COMPLETED rejects any action', () => {
      expect(computeEnrollmentTransition({ status: 'COMPLETED', progressPercent: 100 }, { type: 'UPDATE_PROGRESS', progressPercent: 50 })).toBeNull();
      expect(computeEnrollmentTransition({ status: 'COMPLETED', progressPercent: 100 }, { type: 'COMPLETE' })).toBeNull();
    });

    it('EXPIRED rejects any action', () => {
      expect(computeEnrollmentTransition({ status: 'EXPIRED', progressPercent: 40 }, { type: 'UPDATE_PROGRESS', progressPercent: 80 })).toBeNull();
    });

    it('non-monotonic progress returns null', () => {
      expect(computeEnrollmentTransition({ status: 'IN_PROGRESS', progressPercent: 50 }, { type: 'UPDATE_PROGRESS', progressPercent: 30 })).toBeNull();
    });

    it('COMPLETE action sets 100%', () => {
      const result = computeEnrollmentTransition({ status: 'IN_PROGRESS', progressPercent: 60 }, { type: 'COMPLETE' });
      expect(result).toEqual({ status: 'COMPLETED', progressPercent: 100 });
    });

    it('EXPIRE action sets EXPIRED status', () => {
      const result = computeEnrollmentTransition({ status: 'IN_PROGRESS', progressPercent: 45 }, { type: 'EXPIRE' });
      expect(result).toEqual({ status: 'EXPIRED', progressPercent: 45 });
    });
  });
});
