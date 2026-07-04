import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { MssService } from '../mss.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('MssService', () => {
  let service: MssService;
  let mockPrisma: any;

  const MANAGER_ID = 'manager-emp-uuid';
  const DIRECT_REPORT_ID = 'direct-report-uuid';
  const OUTSIDER_ID = 'outsider-emp-uuid';
  const HR_ADMIN = 'Admin';
  const MANAGER = 'Manager';

  const mockEmployee = (overrides: Record<string, unknown> = {}) => ({
    id: DIRECT_REPORT_ID,
    companyId: 'company-1',
    user: { firstName: 'Jane', lastName: 'Doe' },
    department: { name: 'Engineering' },
    jobTitle: { title: 'Software Engineer' },
    ...overrides,
  });

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        employee: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          findMany: vi.fn().mockResolvedValue([{ id: DIRECT_REPORT_ID }]),
        },
        leaveRequest: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
        leaveBalance: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        payrollEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        attendanceLog: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MssService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(MssService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── getEmployeeSummary() ──────────────────────────────────────────────

  describe('getEmployeeSummary()', () => {
    beforeEach(() => {
      mockPrisma.unscopedClient.employee.findUnique.mockResolvedValue(mockEmployee());
    });

    it('returns employee summary with correct shape', async () => {
      mockPrisma.unscopedClient.leaveBalance.findMany.mockResolvedValue([
        { leaveType: { name: 'Annual' }, entitled: '20', used: '5', balance: '15' },
      ]);

      const result = await service.getEmployeeSummary(DIRECT_REPORT_ID, MANAGER_ID, HR_ADMIN);

      expect(result.employeeId).toBe(DIRECT_REPORT_ID);
      expect(result.name).toBe('Jane Doe');
      expect(result.jobTitle).toBe('Software Engineer');
      expect(result.department).toBe('Engineering');
    });

    it('MANAGER role: lastPayrollNetPay is null', async () => {
      // Setup manager access: employee has managerId = MANAGER_ID
      mockPrisma.unscopedClient.employee.findUnique.mockImplementation((args: any) => {
        if (args.where?.id === DIRECT_REPORT_ID) {
          return Promise.resolve(mockEmployee({ managerId: MANAGER_ID }));
        }
        return Promise.resolve(null);
      });
      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue({ id: DIRECT_REPORT_ID });

      const result = await service.getEmployeeSummary(DIRECT_REPORT_ID, MANAGER_ID, MANAGER);
      expect(result.lastPayrollNetPay).toBeNull();
    });

    it('HR_ADMIN role: lastPayrollNetPay is populated via round2dp', async () => {
      mockPrisma.unscopedClient.payrollEntry.findFirst.mockResolvedValue({ netPayable: '55250.555' });

      const result = await service.getEmployeeSummary(DIRECT_REPORT_ID, MANAGER_ID, HR_ADMIN);
      expect(result.lastPayrollNetPay).toBeCloseTo(55250.56, 2);
    });

    it('HR_ADMIN role: lastPayrollNetPay is null when no entry exists', async () => {
      mockPrisma.unscopedClient.payrollEntry.findFirst.mockResolvedValue(null);

      const result = await service.getEmployeeSummary(DIRECT_REPORT_ID, MANAGER_ID, HR_ADMIN);
      expect(result.lastPayrollNetPay).toBeNull();
    });

    it('throws ForbiddenException when MANAGER accesses non-team employee', async () => {
      mockPrisma.unscopedClient.employee.findUnique.mockResolvedValue(mockEmployee({ id: OUTSIDER_ID }));
      // assertManagerAccess: no match for managerId
      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.getEmployeeSummary(OUTSIDER_ID, MANAGER_ID, MANAGER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('HR_ADMIN can access any employee regardless of team', async () => {
      mockPrisma.unscopedClient.employee.findUnique.mockResolvedValue(
        mockEmployee({ id: OUTSIDER_ID }),
      );

      await expect(
        service.getEmployeeSummary(OUTSIDER_ID, MANAGER_ID, HR_ADMIN),
      ).resolves.toBeDefined();
    });

    it('throws NotFoundException when employee does not exist', async () => {
      mockPrisma.unscopedClient.employee.findUnique.mockResolvedValue(null);

      // For HR_ADMIN, assertManagerAccess passes, but findUnique returns null
      await expect(
        service.getEmployeeSummary('ghost-id', MANAGER_ID, HR_ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('attendanceSummary has required fields', async () => {
      const result = await service.getEmployeeSummary(DIRECT_REPORT_ID, MANAGER_ID, HR_ADMIN);

      expect(result.attendanceSummary).toBeDefined();
      expect(result.attendanceSummary).toMatchObject({
        presentDays: expect.any(Number),
        absentDays: expect.any(Number),
        lateDays: expect.any(Number),
        currentMonthPeriod: expect.stringMatching(/^\d{4}-\d{2}$/),
      });
    });

    it('attendanceSummary counts are non-negative integers', async () => {
      const result = await service.getEmployeeSummary(DIRECT_REPORT_ID, MANAGER_ID, HR_ADMIN);

      expect(result.attendanceSummary.presentDays).toBeGreaterThanOrEqual(0);
      expect(result.attendanceSummary.absentDays).toBeGreaterThanOrEqual(0);
      expect(result.attendanceSummary.lateDays).toBeGreaterThanOrEqual(0);
    });

    it('pendingLeaveRequests is >= 0', async () => {
      mockPrisma.unscopedClient.leaveRequest.count.mockResolvedValue(3);

      const result = await service.getEmployeeSummary(DIRECT_REPORT_ID, MANAGER_ID, HR_ADMIN);
      expect(result.pendingLeaveRequests).toBe(3);
    });

    it('pendingLeaveRequests is 0 when no pending', async () => {
      mockPrisma.unscopedClient.leaveRequest.count.mockResolvedValue(0);

      const result = await service.getEmployeeSummary(DIRECT_REPORT_ID, MANAGER_ID, HR_ADMIN);
      expect(result.pendingLeaveRequests).toBe(0);
    });
  });

  // ─── getTeamLeaveRequests() ────────────────────────────────────────────

  describe('getTeamLeaveRequests()', () => {
    it('returns empty page when manager has no direct reports', async () => {
      mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([]);

      const result = await service.getTeamLeaveRequests(MANAGER_ID, MANAGER, {
        page: 1,
        limit: 20,
      });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns paginated team leave requests', async () => {
      mockPrisma.unscopedClient.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'req-1',
          employeeId: DIRECT_REPORT_ID,
          employee: { user: { firstName: 'Jane', lastName: 'Doe' } },
          leaveType: { name: 'Annual' },
          startDate: new Date('2025-08-04'),
          endDate: new Date('2025-08-05'),
          totalDays: '2',
          status: 'PENDING',
          createdAt: new Date('2025-08-01'),
        },
      ]);
      mockPrisma.unscopedClient.leaveRequest.count.mockResolvedValue(1);

      const result = await service.getTeamLeaveRequests(MANAGER_ID, MANAGER, {
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('filters by status when provided', async () => {
      await service.getTeamLeaveRequests(MANAGER_ID, MANAGER, {
        page: 1,
        limit: 10,
        status: 'APPROVED',
      });

      expect(mockPrisma.unscopedClient.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
    });

    it('HR_ADMIN can view all leave requests', async () => {
      mockPrisma.unscopedClient.leaveRequest.findMany.mockResolvedValue([]);
      mockPrisma.unscopedClient.leaveRequest.count.mockResolvedValue(0);

      await service.getTeamLeaveRequests(MANAGER_ID, HR_ADMIN, {
        page: 1,
        limit: 20,
      });

      expect(mockPrisma.unscopedClient.leaveRequest.findMany).toHaveBeenCalled();
    });
  });
});
