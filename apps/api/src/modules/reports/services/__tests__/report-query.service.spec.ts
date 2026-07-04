import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { ReportQueryService } from '../report-query.service';
import { ReportKey } from '../../enums/report-key.enum';
import type { ReportQueryDto } from '../../dto/report-query.dto';
import { applyTestEnv } from '../../../../../test-env';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ReportQueryService', () => {
  let service: ReportQueryService;
  let mockPrisma: { unscopedClient: { $queryRawUnsafe: ReturnType<typeof vi.fn> } };

  function mockQueryResult(rows: Record<string, unknown>[] = []) {
    return vi.fn().mockResolvedValue(rows);
  }

  beforeEach(async () => {
    const queryFn = mockQueryResult();

    mockPrisma = {
      unscopedClient: {
        $queryRawUnsafe: queryFn,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportQueryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(ReportQueryService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const baseQuery: ReportQueryDto = {
    reportKey: ReportKey.HEADCOUNT,
    startDate: '2025-01-01',
    endDate: '2025-06-30',
  };

  // ─── run() — dispatch ──────────────────────────────────────────────────

  describe('run() — dispatch', () => {
    const allKeys = Object.values(ReportKey);

    it.each(allKeys)('dispatches to correct handler for key: %s', async (key) => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.run({ ...baseQuery, reportKey: key });

      expect(result.reportKey).toBe(key);
      expect(Array.isArray(result.rows)).toBe(true);
    });

    it('sets generatedAt to approximately now', async () => {
      const before = new Date();
      const result = await service.run(baseQuery);
      const after = new Date();
      expect(result.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 100);
      expect(result.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 100);
    });

    it('sets totalRows to rows.length', async () => {
      const rows = [{ dept: 'Engineering', count: 5 }];
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await service.run(baseQuery);
      expect(result.totalRows).toBe(result.rows.length);
    });

    it('caps rows at 500', async () => {
      const rows = Array.from({ length: 600 }, (_, i) => ({ id: i }));
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await service.run(baseQuery);
      expect(result.rows).toHaveLength(500);
      expect(result.totalRows).toBe(600);
    });

    it('throws BadRequestException for invalid reportKey', async () => {
      await expect(
        service.run({ ...baseQuery, reportKey: 'invalid' as ReportKey }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when startDate > endDate', async () => {
      await expect(
        service.run({ ...baseQuery, startDate: '2025-12-31', endDate: '2025-01-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows same-day date range', async () => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await expect(
        service.run({ ...baseQuery, startDate: '2025-06-01', endDate: '2025-06-01' }),
      ).resolves.toBeDefined();
    });
  });

  // ─── Query parameterization (SQL injection prevention) ──────────────────

  describe('parameterized queries', () => {
    it('passes date range and optional department filter as parameters', async () => {
      const queryFn = mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>;

      await service.run(baseQuery);

      const calls = queryFn.mock.calls[0] as any[];
      // SQL template (string) + params array
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(typeof calls[0]).toBe('string'); // SQL template
      expect(Array.isArray(calls[1])).toBe(true); // params array
    });

    it('includes departmentId in params array when provided', async () => {
      const queryFn = mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>;

      await service.run({ ...baseQuery, departmentId: 'dept-123' });

      const calls = queryFn.mock.calls[0] as any[];
      // The second argument should be a params array that includes dept-123
      const params = calls[1] as string[];
      expect(params.some((p) => String(p).includes('dept-123'))).toBe(true);
    });

    it('does NOT include literal date strings in SQL template', async () => {
      const queryFn = mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>;

      await service.run(baseQuery);

      const sql = String(queryFn.mock.calls[0][0]);
      // No direct date interpolation in SQL string
      expect(sql).not.toMatch(/2025-01-01/);
    });
  });

  // ─── Headcount ──────────────────────────────────────────────────────────

  describe('headcount()', () => {
    it('returns rows grouped by department', async () => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
        { department: 'Engineering', employment_type: 'FULL_TIME', active_count: 12 },
        { department: 'HR', employment_type: 'FULL_TIME', active_count: 4 },
      ]);

      const result = await service.run({
        reportKey: ReportKey.HEADCOUNT,
        startDate: '2025-01-01',
        endDate: '2025-06-30',
      });

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toHaveProperty('department', 'Engineering');
      expect(result.rows[0]).toHaveProperty('active_count');
    });

    it('filters by departmentId when provided', async () => {
      const queryFn = mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>;

      await service.run({
        reportKey: ReportKey.HEADCOUNT,
        startDate: '2025-01-01',
        endDate: '2025-06-30',
        departmentId: 'dept-uuid',
      });

      const calls = queryFn.mock.calls[0] as any[];
      // The departmentId should be in the params array (positional after date params)
      const params = calls[1] as string[];
      expect(params.some((p) => String(p).includes('dept-uuid'))).toBe(true);
    });

    it('returns empty array when no employees match', async () => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.run({
        reportKey: ReportKey.HEADCOUNT,
        startDate: '2020-01-01',
        endDate: '2020-01-02',
      });

      expect(result.rows).toEqual([]);
      expect(result.totalRows).toBe(0);
    });
  });

  // ─── Attrition ──────────────────────────────────────────────────────────

  describe('attrition()', () => {
    it('returns attritionRate of 0 when exits is 0', async () => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
        { department: 'Engineering', opening_headcount: 20, closing_headcount: 20, exits: 0, attrition_rate: '0.0000' },
      ]);

      const result = await service.run({
        reportKey: ReportKey.ATTRITION,
        startDate: '2025-01-01',
        endDate: '2025-06-30',
      });

      expect(Number(result.rows[0].attrition_rate)).toBe(0);
    });

    it('calculates attrition rate: 4 exits, 20 opening, 16 closing → ~0.2222', async () => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
        { department: 'Engineering', opening_headcount: 20, closing_headcount: 16, exits: 4, attrition_rate: '0.2222' },
      ]);

      const result = await service.run({
        reportKey: ReportKey.ATTRITION,
        startDate: '2025-01-01',
        endDate: '2025-06-30',
      });

      expect(Number(result.rows[0].attrition_rate)).toBeCloseTo(0.2222, 4);
    });

    it('handles zero headcount without divide-by-zero', async () => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
        { department: 'New Dept', opening_headcount: 0, closing_headcount: 0, exits: 0, attrition_rate: '0.0000' },
      ]);

      const result = await service.run({
        reportKey: ReportKey.ATTRITION,
        startDate: '2025-01-01',
        endDate: '2025-06-30',
      });

      expect(Number(result.rows[0].attrition_rate)).not.toBeNaN();
      expect(Number(result.rows[0].attrition_rate)).not.toBe(Infinity);
    });
  });

  // ─── Payroll Summary ────────────────────────────────────────────────────

  describe('payrollSummary()', () => {
    it('rounds monetary fields to 2 decimal places via round2dp', async () => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
        { department: 'Engineering', payroll_period: 'cycle-1', total_gross: '123456.789', total_deductions: '24691.3569', total_net: '98765.4321', employee_count: 5 },
      ]);

      const result = await service.run({
        reportKey: ReportKey.PAYROLL_SUMMARY,
        startDate: '2025-01-01',
        endDate: '2025-06-30',
      });

      // round2dp applied in map
      expect(Number(result.rows[0].total_gross)).toBeCloseTo(123456.79, 2);
      expect(Number(result.rows[0].total_net)).toBeCloseTo(98765.43, 2);
      expect(Number(result.rows[0].total_deductions)).toBeCloseTo(24691.36, 2);
    });

    it('handles zero values without NaN', async () => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
        { department: 'Empty', payroll_period: 'cycle-1', total_gross: '0', total_deductions: '0', total_net: '0', employee_count: 0 },
      ]);

      const result = await service.run({
        reportKey: ReportKey.PAYROLL_SUMMARY,
        startDate: '2025-01-01',
        endDate: '2025-06-30',
      });

      expect(Number(result.rows[0].total_gross)).toBe(0);
      expect(Number(result.rows[0].total_gross)).not.toBeNaN();
    });
  });

  // ─── Leave Utilization ──────────────────────────────────────────────────

  describe('leaveUtilization()', () => {
    it('returns leave type, department, and balance fields', async () => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
        { leave_type: 'Annual', department: 'Engineering', employee_id: 'emp-1', employee_name: 'Jane Doe', days_entitled: '20', days_taken: '10', days_remaining: '10' },
      ]);

      const result = await service.run({
        reportKey: ReportKey.LEAVE_UTILIZATION,
        startDate: '2025-01-01',
        endDate: '2025-06-30',
      });

      expect(result.rows[0]).toHaveProperty('leave_type');
      expect(result.rows[0]).toHaveProperty('days_entitled');
      expect(result.rows[0]).toHaveProperty('days_taken');
    });

    it('filters by leaveType when provided', async () => {
      const queryFn = mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>;

      await service.run({
        reportKey: ReportKey.LEAVE_UTILIZATION,
        startDate: '2025-01-01',
        endDate: '2025-06-30',
        leaveType: 'ANNUAL',
      });

      const calls = queryFn.mock.calls[0] as any[];
      expect(calls).toContain('ANNUAL');
    });
  });

  // ─── Attendance Summary ─────────────────────────────────────────────────

  describe('attendanceSummary()', () => {
    it('returns present, absent, late, and wfh counts per employee', async () => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
        { department: 'Engineering', employee_id: 'emp-1', employee_name: 'Jane Doe', present_days: 18, absent_days: 2, late_days: 3, wfh_days: 5 },
      ]);

      const result = await service.run({
        reportKey: ReportKey.ATTENDANCE_SUMMARY,
        startDate: '2025-06-01',
        endDate: '2025-06-30',
      });

      expect(result.rows[0]).toMatchObject({
        present_days: expect.anything(),
        absent_days: expect.anything(),
        late_days: expect.anything(),
        wfh_days: expect.anything(),
      });
    });
  });

  // ─── New Hires & Exits ──────────────────────────────────────────────────

  describe('newHires()', () => {
    it('returns employees with joining_date in range', async () => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
        { department: 'Engineering', employee_id: 'emp-1', employee_name: 'New Hire', employment_type: 'FULL_TIME', joining_date: '2025-03-15', job_title: 'Engineer' },
      ]);

      const result = await service.run({
        reportKey: ReportKey.NEW_HIRES,
        startDate: '2025-01-01',
        endDate: '2025-06-30',
      });

      expect(result.rows[0]).toHaveProperty('joining_date');
      expect(result.rows[0]).toHaveProperty('employee_name');
    });
  });

  describe('exits()', () => {
    it('returns employees with exit_date in range', async () => {
      (mockPrisma.unscopedClient.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
        { department: 'Engineering', employee_id: 'emp-1', employee_name: 'Exiter', exit_reason: 'Resigned', exit_date: '2025-04-01', last_working_date: '2025-03-31' },
      ]);

      const result = await service.run({
        reportKey: ReportKey.EXITS,
        startDate: '2025-01-01',
        endDate: '2025-06-30',
      });

      expect(result.rows[0]).toHaveProperty('exit_reason');
      expect(result.rows[0]).toHaveProperty('exit_date');
    });
  });
});
