import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../../../modules/audit/audit.service';
import { CourseService } from '../course.service';
import { makeCourse, makeSkill } from '../../../../../../../test/factories/sprint9.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('CourseService', () => {
  let service: CourseService;
  let mockPrisma: any;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockEvents = { emit: vi.fn() };
    mockPrisma = {
      unscopedClient: {
        course: {
          findUnique: vi.fn().mockResolvedValue(makeCourse({ status: 'DRAFT' })),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'course-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ id: args.where.id, ...args.data })),
          findMany: vi.fn().mockResolvedValue([makeCourse()]),
        },
        skillTaxonomy: {
          findMany: vi.fn().mockImplementation((args: any) => {
            const ids = args?.where?.id?.in ?? [];
            const allSkills = [makeSkill(), makeSkill({ id: 'skill-002', name: 'Leadership' })];
            return allSkills.filter(s => ids.includes(s.id));
          }),
        },
        courseSkillTag: {
          deleteMany: vi.fn().mockResolvedValue({}),
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
        CourseService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: AuditService, useValue: { logAsync: vi.fn() } },
      ],
    }).compile();

    service = module.get(CourseService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── Create Course ──────────────────────────────────────────────────

  describe('createCourse', () => {
    it('creates draft course with skill tags', async () => {
      const result = await service.createCourse({
        companyId: 'comp-1', title: 'New Course', format: 'SELF_PACED',
        durationMinutes: 60, isMandatory: false, skillIds: ['skill-001'], createdById: 'admin-1',
      });
      expect(result.title).toBe('New Course');
    });

    it('rejects invalid skill IDs', async () => {
      mockPrisma.unscopedClient.skillTaxonomy.findMany.mockResolvedValue([]);
      await expect(service.createCourse({
        companyId: 'comp-1', title: 'Bad Course', format: 'SELF_PACED',
        durationMinutes: 60, isMandatory: false, skillIds: ['bad-skill'], createdById: 'admin-1',
      })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Status Transitions ─────────────────────────────────────────────

  describe('status transitions', () => {
    it('allows DRAFT → PUBLISHED', async () => {
      mockPrisma.unscopedClient.course.findUnique.mockResolvedValue(makeCourse({ status: 'DRAFT' }));
      await service.updateCourse('course-001', { status: 'PUBLISHED' }, 'admin-1');
      expect(mockPrisma.unscopedClient.course.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PUBLISHED' } }),
      );
    });

    it('allows PUBLISHED → ARCHIVED', async () => {
      mockPrisma.unscopedClient.course.findUnique.mockResolvedValue(makeCourse({ status: 'PUBLISHED' }));
      await service.updateCourse('course-001', { status: 'ARCHIVED' }, 'admin-1');
      expect(mockPrisma.unscopedClient.course.update).toHaveBeenCalled();
    });

    it('allows ARCHIVED → DRAFT (admin revert)', async () => {
      mockPrisma.unscopedClient.course.findUnique.mockResolvedValue(makeCourse({ status: 'ARCHIVED' }));
      await service.updateCourse('course-001', { status: 'DRAFT' }, 'admin-1');
      expect(mockPrisma.unscopedClient.course.update).toHaveBeenCalled();
    });

    it('rejects DRAFT → ARCHIVED (skip PUBLISHED)', async () => {
      mockPrisma.unscopedClient.course.findUnique.mockResolvedValue(makeCourse({ status: 'DRAFT' }));
      await expect(service.updateCourse('course-001', { status: 'ARCHIVED' }, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects PUBLISHED → DRAFT (no reverse)', async () => {
      mockPrisma.unscopedClient.course.findUnique.mockResolvedValue(makeCourse({ status: 'PUBLISHED' }));
      await expect(service.updateCourse('course-001', { status: 'DRAFT' }, 'admin-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Tag Skills ─────────────────────────────────────────────────────

  describe('tagSkills', () => {
    it('replaces existing skill tags', async () => {
      mockPrisma.unscopedClient.course.findUnique.mockResolvedValue(makeCourse());
      await service.tagSkills('course-001', ['skill-001', 'skill-002']);
      expect(mockPrisma.unscopedClient.courseSkillTag.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.unscopedClient.courseSkillTag.create).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundException for missing course', async () => {
      mockPrisma.unscopedClient.course.findUnique.mockResolvedValue(null);
      await expect(service.tagSkills('bad-id', ['skill-001'])).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Upload Thumbnail ───────────────────────────────────────────────

  describe('uploadThumbnail', () => {
    it('persists S3 key only', async () => {
      mockPrisma.unscopedClient.course.findUnique.mockResolvedValue(makeCourse());
      await service.uploadThumbnail('course-001', 'thumbnails/course-001.png');
      expect(mockPrisma.unscopedClient.course.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { thumbnailKey: 'thumbnails/course-001.png' } }),
      );
    });
  });
});
