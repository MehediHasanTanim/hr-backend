import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@hr/prisma';
import {
  WorkforceDemographicsService,
  PayrollTrendsService,
  LeaveLiabilityService,
} from '../dashboard.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('WorkforceDemographicsService', () => {
  let service: WorkforceDemographicsService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        employee: {
          findMany: vi.fn().mockResolvedValue([
            { department: { name: 'Engineering' }, employmentType: 'FULL_TIME', joinedAt: new Date('2022-01-01') },
            { department: { name: 'Engineering' }, employmentType: 'FULL_TIME', joinedAt: new Date('2024-06-01') },
            { department: { name: 'Marketing' }, employmentType: 'CONTRACT', joinedAt: new Date('2025-11-01') },
            { department: null, employmentType: 'INTERN', joinedAt: new Date('2026-01-01') },
          ]),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkforceDemographicsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(WorkforceDemographicsService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('getDemographics', () => {
    it('returns total employee count', async () => {
      const result = await service.getDemographics('comp-1');
      expect(result.totalEmployees).toBe(4);
    });

    it('aggregates by department', async () => {
      const result = await service.getDemographics('comp-1');
      expect(result.byDepartment['Engineering']).toBe(2);
      expect(result.byDepartment['Marketing']).toBe(1);
      expect(result.byDepartment['Unassigned']).toBe(1);
    });

    it('aggregates by employment type', async () => {
      const result = await service.getDemographics('comp-1');
      expect(result.byType['FULL_TIME']).toBe(2);
      expect(result.byType['CONTRACT']).toBe(1);
      expect(result.byType['INTERN']).toBe(1);
    });

    it('aggregates by tenure band', async () => {
      const result = await service.getDemographics('comp-1');
      expect(result.byTenure['3-5yr']).toBe(1); // Jan 2022
      expect(result.byTenure['1-3yr']).toBe(1); // Jun 2024
      expect(result.byTenure['0-1yr']).toBe(2); // Nov 2025 + Jan 2026
    });

    it('filters by companyId and active status', async () => {
      await service.getDemographics('comp-1');
      expect(mockPrisma.unscopedClient.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'comp-1', status: 'ACTIVE' } }),
      );
    });

    it('handles empty employee list', async () => {
      mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([]);
      const result = await service.getDemographics('comp-1');
      expect(result.totalEmployees).toBe(0);
      expect(Object.keys(result.byDepartment)).toHaveLength(0);
    });
  });
});

describe('PayrollTrendsService', () => {
  let service: PayrollTrendsService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        payrollRun: {
          findMany: vi.fn().mockResolvedValue([
            { totalGross: 50000, totalNet: 35000, totalTax: 15000, processedAt: new Date('2025-01-15') },
            { totalGross: 52000, totalNet: 36400, totalTax: 15600, processedAt: new Date('2025-02-15') },
          ]),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollTrendsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(PayrollTrendsService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('getTrends', () => {
    it('returns monthly payroll data', async () => {
      const result = await service.getTrends('comp-1', 12);
      expect(result.data).toHaveLength(2);
    });

    it('maps gross/net/tax correctly', async () => {
      const result = await service.getTrends('comp-1');
      expect(result.data[0].gross).toBe(50000);
      expect(result.data[0].net).toBe(35000);
      expect(result.data[0].tax).toBe(15000);
    });

    it('formats date as YYYY-MM', async () => {
      const result = await service.getTrends('comp-1');
      expect(result.data[0].date).toBe('2025-01');
      expect(result.data[1].date).toBe('2025-02');
    });

    it('uses default 12 month window', async () => {
      await service.getTrends('comp-1');
      const call = mockPrisma.unscopedClient.payrollRun.findMany.mock.calls[0][0];
      expect(call.where.processedAt.gte).toBeDefined();
    });

    it('handles empty trend data', async () => {
      mockPrisma.unscopedClient.payrollRun.findMany.mockResolvedValue([]);
      const result = await service.getTrends('comp-1');
      expect(result.data).toHaveLength(0);
    });
  });
});

describe('LeaveLiabilityService', () => {
  let service: LeaveLiabilityService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        leaveBalance: {
          findMany: vi.fn().mockResolvedValue([
            {
              leaveType: { isPaid: true, code: 'ANNUAL' },
              balance: 10,
              employeeId: 'emp-1',
              employee: {
                companyId: 'comp-1',
                status: 'ACTIVE',
                employeeSalaries: [{ ctc: 52000, status: 'APPROVED' }],
              },
            },
            {
              leaveType: { isPaid: false, code: 'UNPAID' },
              balance: 20,
              employeeId: 'emp-2',
              employee: {
                companyId: 'comp-1',
                status: 'ACTIVE',
                employeeSalaries: [],
              },
            },
            {
              leaveType: { isPaid: true, code: 'SICK' },
              balance: 0,
              employeeId: 'emp-3',
              employee: {
                companyId: 'comp-1',
                status: 'ACTIVE',
                employeeSalaries: [{ ctc: 78000, status: 'APPROVED' }],
              },
            },
          ]),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LeaveLiabilityService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(LeaveLiabilityService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('getLiability', () => {
    it('excludes unpaid leave types', async () => {
      const result = await service.getLiability('comp-1');
      const hasUnpaidType = result.items.some(i => i.leaveType === 'UNPAID');
      expect(hasUnpaidType).toBe(false);
    });

    it('excludes zero balance items', async () => {
      const result = await service.getLiability('comp-1');
      const sickItem = result.items.find(i => i.leaveType === 'SICK');
      expect(sickItem).toBeUndefined();
    });

    it('calculates liability as unusedDays × dailyRate', async () => {
      const result = await service.getLiability('comp-1');
      const annualItem = result.items.find(i => i.leaveType === 'ANNUAL');
      expect(annualItem).toBeDefined();
      expect(annualItem!.unusedDays).toBe(10);
      expect(annualItem!.dailyRate).toBe(200); // 52000 / 260
      expect(annualItem!.liability).toBe(2000); // 10 × 200
    });

    it('calculates total liability across all employees', async () => {
      const result = await service.getLiability('comp-1');
      expect(result.totalLiability).toBe(2000); // only emp-1 has balance
      expect(result.count).toBe(1);
    });

    it('handles employees with no salary data', async () => {
      // Employee 2 already has empty salary — they're excluded due to unpaid leave type
      // Add a paid-leave employee with no salary
      mockPrisma.unscopedClient.leaveBalance.findMany.mockResolvedValue([{
        leaveType: { isPaid: true, code: 'ANNUAL' },
        balance: 5,
        employeeId: 'emp-x',
        employee: {
          companyId: 'comp-1', status: 'ACTIVE',
          employeeSalaries: [],
        },
      }]);
      const result = await service.getLiability('comp-1');
      expect(result.items[0].dailyRate).toBe(0);
      expect(result.items[0].liability).toBe(0);
    });

    it('aggregates across all employees', async () => {
      const result = await service.getLiability('comp-1');
      expect(result.count).toBe(1);
      expect(result.totalLiability).toBeGreaterThanOrEqual(0);
    });
  });
});
