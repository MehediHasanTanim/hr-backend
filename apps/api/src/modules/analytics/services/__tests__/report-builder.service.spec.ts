import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../../../modules/audit/audit.service';
import { ReportBuilderService } from '../report-builder.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ReportBuilderService', () => {
  let service: ReportBuilderService;
  let mockPrisma: any;
  let mockAudit: { logAsync: ReturnType<typeof vi.fn> };

  const validDef = {
    fields: ['id', 'fullName', 'department', 'employmentType'],
    filters: [{ field: 'department', operator: 'EQ', value: 'Engineering' }],
    columns: ['fullName', 'department'],
    limit: 100,
  };

  beforeEach(async () => {
    mockAudit = { logAsync: vi.fn().mockResolvedValue(undefined) };
    mockPrisma = {
      unscopedClient: {
        customSavedReport: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'r-001', ...args.data })),
          update: vi.fn().mockResolvedValue({}),
          delete: vi.fn().mockResolvedValue({}),
        },
        reportRun: { create: vi.fn().mockResolvedValue({}) },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportBuilderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(ReportBuilderService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('creates report with valid definition', async () => {
      const result = await service.create({
        companyId: 'comp-1', name: 'Test Report', entityType: 'EMPLOYEE',
        definition: validDef, createdById: 'admin-1',
      });
      expect(result.name).toBe('Test Report');
    });

    it('rejects unknown field in definition', async () => {
      await expect(service.create({
        companyId: 'comp-1', name: 'Bad', entityType: 'EMPLOYEE',
        definition: { ...validDef, fields: ['salary'] }, createdById: 'admin-1',
      })).rejects.toThrow(BadRequestException);
    });

    it('rejects unknown filter field', async () => {
      await expect(service.create({
        companyId: 'comp-1', name: 'Bad', entityType: 'EMPLOYEE',
        definition: { ...validDef, filters: [{ field: 'password', operator: 'EQ', value: 'x' }] },
        createdById: 'admin-1',
      })).rejects.toThrow(BadRequestException);
    });

    it('rejects limit exceeding maximum', async () => {
      await expect(service.create({
        companyId: 'comp-1', name: 'Bad', entityType: 'EMPLOYEE',
        definition: { ...validDef, limit: 10000 }, createdById: 'admin-1',
      })).rejects.toThrow(BadRequestException);
    });

    it('rejects unknown entity type', async () => {
      await expect(service.create({
        companyId: 'comp-1', name: 'Bad', entityType: 'UNKNOWN',
        definition: validDef, createdById: 'admin-1',
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('run', () => {
    it('creates ReportRun record on execution', async () => {
      mockPrisma.unscopedClient.customSavedReport.findUnique.mockResolvedValue({
        id: 'r-001', entityType: 'EMPLOYEE', definition: validDef,
      });
      await service.run('r-001', 'user-1', []);
      expect(mockPrisma.unscopedClient.reportRun.create).toHaveBeenCalled();
    });

    it('strips restricted fields for non-payroll-admin', async () => {
      mockPrisma.unscopedClient.customSavedReport.findUnique.mockResolvedValue({
        id: 'r-001', entityType: 'PAYROLL',
        definition: {
          fields: ['employeeId', 'grossPay', 'netPay', 'deductions'],
          columns: ['employeeId', 'grossPay', 'netPay'],
          filters: [{ field: 'employeeId', operator: 'EQ', value: 'x' }],
          limit: 10,
        },
      });
      const result = await service.run('r-001', 'user-1', ['manager']);
      // Non-payroll-admin should have restricted fields stripped
      expect(result.columns).not.toContain('grossPay');
      expect(result.columns).not.toContain('netPay');
    });

    it('allows restricted fields for payroll_admin role', async () => {
      mockPrisma.unscopedClient.customSavedReport.findUnique.mockResolvedValue({
        id: 'r-001', entityType: 'PAYROLL',
        definition: {
          fields: ['employeeId', 'grossPay', 'netPay'],
          columns: ['employeeId', 'grossPay'],
          filters: [],
          limit: 10,
        },
      });
      const result = await service.run('r-001', 'user-1', ['payroll_admin']);
      expect(result.columns).toContain('grossPay');
    });

    it('throws NotFoundException for missing report', async () => {
      mockPrisma.unscopedClient.customSavedReport.findUnique.mockResolvedValue(null);
      await expect(service.run('bad-id', 'user-1', [])).rejects.toThrow(NotFoundException);
    });
  });

  describe('CRUD', () => {
    it('lists reports for company', async () => {
      const result = await service.list('comp-1');
      expect(result).toEqual([]);
    });

    it('deletes report', async () => {
      mockPrisma.unscopedClient.customSavedReport.findUnique.mockResolvedValue({ id: 'r-001' });
      await service.delete('r-001');
      expect(mockPrisma.unscopedClient.customSavedReport.delete).toHaveBeenCalled();
    });
  });
});
