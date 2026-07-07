import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { LearningPathService } from '../learning-path.service';
import { makeLearningPath, makeCourse } from '../../../../../../../test/factories/sprint9.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('LearningPathService', () => {
  let service: LearningPathService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        learningPath: {
          findUnique: vi.fn().mockResolvedValue(makeLearningPath({ courses: [{}] })),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'lp-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ id: args.where.id, ...args.data })),
          findMany: vi.fn().mockResolvedValue([makeLearningPath()]),
        },
        learningPathCourse: {
          create: vi.fn().mockImplementation((args: any) => ({ id: 'lpc-001', ...args.data })),
          updateMany: vi.fn().mockResolvedValue({}),
          deleteMany: vi.fn().mockResolvedValue({}),
        },
        course: { findUnique: vi.fn().mockResolvedValue(makeCourse()) },
        courseEnrollment: { count: vi.fn().mockResolvedValue(0) },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LearningPathService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(LearningPathService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── Create & Update ────────────────────────────────────────────────

  describe('createPath', () => {
    it('creates learning path', async () => {
      const result = await service.createPath({ companyId: 'comp-1', title: 'Engineering Path', createdById: 'admin-1' });
      expect(result.title).toBe('Engineering Path');
    });
  });

  describe('updatePath', () => {
    it('updates title and description', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(makeLearningPath());
      const result = await service.updatePath('lp-001', { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });

    it('throws NotFoundException when missing', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(null);
      await expect(service.updatePath('bad-id', { title: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Publish ────────────────────────────────────────────────────────

  describe('publishPath', () => {
    it('publishes path with at least one course', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(
        makeLearningPath({ courses: [{ id: 'lpc-1', courseId: 'c-1', sequenceOrder: 1 }] }),
      );
      await service.publishPath('lp-001');
      expect(mockPrisma.unscopedClient.learningPath.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PUBLISHED' } }),
      );
    });

    it('rejects publish with zero courses', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(makeLearningPath({ courses: [] }));
      await expect(service.publishPath('lp-001')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Sequence Management ────────────────────────────────────────────

  describe('addCourseToSequence', () => {
    it('adds course at given position', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(makeLearningPath());
      const result = await service.addCourseToSequence('lp-001', 'course-001', 2);
      expect(result.sequenceOrder).toBe(2);
      expect(result.courseId).toBe('course-001');
    });

    it('throws NotFoundException for missing path', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(null);
      await expect(service.addCourseToSequence('bad-id', 'course-001', 1)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for missing course', async () => {
      mockPrisma.unscopedClient.course.findUnique.mockResolvedValue(null);
      await expect(service.addCourseToSequence('lp-001', 'bad-course', 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('reorderSequence', () => {
    it('reassigns sequence orders in bulk', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(makeLearningPath());
      await service.reorderSequence('lp-001', ['c-3', 'c-1', 'c-2']);
      expect(mockPrisma.unscopedClient.learningPathCourse.updateMany).toHaveBeenCalledTimes(3);
    });

    it('throws NotFoundException for missing path', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(null);
      await expect(service.reorderSequence('bad-id', ['c-1'])).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeCourseFromSequence', () => {
    it('removes course when no active enrollments', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(makeLearningPath());
      mockPrisma.unscopedClient.courseEnrollment.count.mockResolvedValue(0);
      await service.removeCourseFromSequence('lp-001', 'course-001');
      expect(mockPrisma.unscopedClient.learningPathCourse.deleteMany).toHaveBeenCalled();
    });

    it('blocks removal with active enrollments', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(makeLearningPath());
      mockPrisma.unscopedClient.courseEnrollment.count.mockResolvedValue(3);
      await expect(service.removeCourseFromSequence('lp-001', 'course-001')).rejects.toThrow(BadRequestException);
    });

    it('allows force removal despite active enrollments', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(makeLearningPath());
      await service.removeCourseFromSequence('lp-001', 'course-001', true);
      expect(mockPrisma.unscopedClient.learningPathCourse.deleteMany).toHaveBeenCalled();
    });
  });

  // ─── Get / List ─────────────────────────────────────────────────────

  describe('getPathById', () => {
    it('returns path with ordered courses', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(makeLearningPath());
      const result = await service.getPathById('lp-001');
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when missing', async () => {
      mockPrisma.unscopedClient.learningPath.findUnique.mockResolvedValue(null);
      await expect(service.getPathById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listPaths', () => {
    it('returns paths for company', async () => {
      const result = await service.listPaths('comp-1');
      expect(result).toHaveLength(1);
    });
  });
});
