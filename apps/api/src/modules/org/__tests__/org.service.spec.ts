import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@hr/prisma';
import { OrgService } from '../org.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockUser = { companyId: 'comp-1', userId: 'user-1', permissions: [] };

describe('OrgService', () => {
  let service: OrgService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        department: {
          findFirst: vi.fn().mockResolvedValue({ id: 'dept-1', name: 'Engineering', children: [] }),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'dept-1', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ id: args.where.id, ...args.data })),
        },
        location: {
          findFirst: vi.fn().mockResolvedValue({ id: 'loc-1', name: 'HQ', code: 'HQ' }),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'loc-1', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ ...args.data })),
        },
        jobTitle: {
          findFirst: vi.fn().mockResolvedValue({ id: 'jt-1', title: 'Engineer', level: 2 }),
          findMany: vi.fn().mockResolvedValue([{ id: 'jt-1', title: 'Engineer', level: 2 }]),
        },
        payGrade: {
          findFirst: vi.fn().mockResolvedValue({ id: 'pg-1', name: 'Grade 5' }),
          findMany: vi.fn().mockResolvedValue([{ id: 'pg-1', name: 'Grade 5' }]),
        },
        employee: { count: vi.fn().mockResolvedValue(0) },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrgService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(OrgService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('departments', () => {
    it('lists departments', async () => {
      const result = await service.listDepartments(mockUser);
      expect(result).toEqual([]);
    });

    it('gets a department', async () => {
      const result = await service.getDepartment(mockUser, 'dept-1');
      expect(result.name).toBe('Engineering');
    });

    it('creates a department', async () => {
      const result = await service.createDepartment(mockUser, { name: 'Design', code: 'DSN' } as any);
      expect(result.name).toBe('Design');
    });
  });

  describe('locations', () => {
    it('lists locations', async () => {
      const result = await service.listLocations(mockUser);
      expect(result).toEqual([]);
    });

    it('gets a location', async () => {
      const result = await service.getLocation(mockUser, 'loc-1');
      expect(result.name).toBe('HQ');
    });

    it('creates a location', async () => {
      const result = await service.createLocation(mockUser, { name: 'Remote', code: 'REM' } as any);
      expect(result.name).toBe('Remote');
    });
  });

  describe('job titles', () => {
    it('lists job titles', async () => {
      const result = await service.listJobTitles(mockUser);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Engineer');
    });

    it('gets a job title', async () => {
      const result = await service.getJobTitle(mockUser, 'jt-1');
      expect(result.title).toBe('Engineer');
    });
  });

  describe('pay grades', () => {
    it('lists pay grades', async () => {
      const result = await service.listPayGrades(mockUser);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Grade 5');
    });

    it('gets a pay grade', async () => {
      const result = await service.getPayGrade(mockUser, 'pg-1');
      expect(result.name).toBe('Grade 5');
    });
  });
});
