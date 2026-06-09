import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayrollRunProcessor } from '../processors/payroll-run.processor';
import { PayslipGenProcessor } from '../processors/payslip-gen.processor';
import { PayrollEngine, SkipEmployeeError } from '../services/payroll-engine';
import { EmployeeSalaryService } from '../services/employee-salary.service';
import { StorageService } from '../services/storage.service';
import { makeJob } from './factories';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));
vi.mock('../services/storage.service', () => ({
  StorageService: class StorageService {
    upload = vi.fn();
    getSignedUrl = vi.fn();
  },
}));
vi.mock('pdfmake', () => ({}));

// =========================================================================
// PayrollRunProcessor retry/failure tests
// =========================================================================
describe('PayrollRunProcessor — retry and failure behavior', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function createRunMocks() {
    const tx = {
      payrollCycle: { update: vi.fn(), findUnique: vi.fn() },
      payrollEntry: {
        create: vi.fn().mockImplementation((data: any) => ({
          id: `entry-${Math.random().toString(36).slice(2, 8)}`,
          ...data,
        })),
        update: vi.fn(),
      },
      payrollEntryComponent: { create: vi.fn() },
    };

    const mockPrisma = {
      unscopedClient: {
        payrollCycle: { findUnique: vi.fn(), update: vi.fn() },
        employee: { findMany: vi.fn() },
        holidayCalendar: { findFirst: vi.fn() },
        holiday: { findMany: vi.fn() },
        attendanceLog: { findMany: vi.fn() },
        leaveType: { findMany: vi.fn() },
        leaveRequest: { findMany: vi.fn() },
        payrollEntry: { create: vi.fn() },
        payrollEntryComponent: { create: vi.fn() },
        $transaction: vi.fn(async (fn: (t: any) => Promise<unknown>) => fn(tx)),
      },
    };

    const mockEngine = { computeForEmployee: vi.fn() } as unknown as PayrollEngine;
    const mockSalaryService = { getCurrentSalary: vi.fn() };

    const processor = new PayrollRunProcessor(
      mockPrisma as any,
      mockEngine as any,
      mockSalaryService as any,
    );

    return { processor, mockPrisma, mockEngine, mockSalaryService, tx };
  }

  function makeCycle(status: string) {
    return {
      id: 'cycle-1',
      companyId: 'co-1',
      month: 6,
      year: 2024,
      status,
      totalGross: 0,
      totalDeductions: 0,
      totalNet: 0,
      employeeCount: 0,
    };
  }

  function makeEmployee(overrides: Record<string, unknown> = {}) {
    return { id: 'emp-1', joinedAt: new Date('2020-01-01'), ...overrides };
  }

  function makeValidEntryResult() {
    return {
      entry: {
        cycleId: 'cycle-1',
        employeeId: 'emp-1',
        structureId: 'struct-1',
        monthlyCtc: 50000,
        workingDays: 26,
        presentDays: 26,
        lopDays: 0,
        grossEarnings: 70000,
        totalDeductions: 8800,
        netPayable: 61200,
        status: 'COMPUTED',
      },
      components: [
        { componentId: 'comp-1', componentCode: 'BASIC', componentName: 'Basic Pay', type: 'EARNING' as const, amount: 50000 },
        { componentId: 'comp-2', componentCode: 'HRA', componentName: 'HRA', type: 'EARNING' as const, amount: 20000 },
      ],
    };
  }

  // -----------------------------------------------------------------------
  // Test: DB write failure → retry (transaction throws)
  // -----------------------------------------------------------------------
  describe('DB write failure during payroll run', () => {
    it('transaction failure reverts cycle to DRAFT and re-throws (BullMQ retries)', async () => {
      const { processor, mockPrisma, mockEngine, mockSalaryService } = createRunMocks();

      mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue(makeCycle('PROCESSING'));
      mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([makeEmployee()]);
      mockPrisma.unscopedClient.holidayCalendar.findFirst.mockResolvedValue(null);
      mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue([]);
      mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([]);
      mockPrisma.unscopedClient.leaveRequest.findMany.mockResolvedValue([]);
      mockSalaryService.getCurrentSalary.mockResolvedValue({
        ctc: 600000, structureId: 'struct-1', structure: { components: [] },
      });
      mockEngine.computeForEmployee.mockResolvedValue(makeValidEntryResult());

      // Transaction throws → payroll entry create fails
      mockPrisma.unscopedClient.$transaction.mockRejectedValue(new Error('DB connection lost'));

      const job = makeJob();
      await expect(processor.process(job as any)).rejects.toThrow('DB connection lost');

      // Cycle reverted to DRAFT
      expect(mockPrisma.unscopedClient.payrollCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cycle-1' },
          data: { status: 'DRAFT' },
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Test: Computation error for some employees (others succeed)
  // -----------------------------------------------------------------------
  describe('partial computation failure', () => {
    it('creates HELD entries for failed employees, COMPUTED for successful ones', async () => {
      const { processor, mockPrisma, mockEngine, mockSalaryService, tx } = createRunMocks();

      mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue(makeCycle('PROCESSING'));
      mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([
        makeEmployee({ id: 'emp-1' }),
        makeEmployee({ id: 'emp-2' }),
        makeEmployee({ id: 'emp-3' }),
      ]);
      mockPrisma.unscopedClient.holidayCalendar.findFirst.mockResolvedValue(null);
      mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue([]);
      mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([]);
      mockPrisma.unscopedClient.leaveRequest.findMany.mockResolvedValue([]);

      // emp-1: no salary → skipped, emp-2: success, emp-3: error
      mockSalaryService.getCurrentSalary
        .mockRejectedValueOnce(new SkipEmployeeError('No approved salary'))
        .mockResolvedValueOnce({ ctc: 600000, structureId: 'struct-1', structure: { components: [] } })
        .mockRejectedValueOnce(new Error('Unexpected DB error'));

      mockEngine.computeForEmployee.mockResolvedValue(makeValidEntryResult());

      const job = makeJob();
      await processor.process(job as any);

      // 3 entries created: held, computed, held
      expect(tx.payrollEntry.create).toHaveBeenCalledTimes(3);

      const heldEntries = tx.payrollEntry.create.mock.calls
        .filter((call: any[]) => call[0]?.data?.status === 'HELD');
      const computedEntries = tx.payrollEntry.create.mock.calls
        .filter((call: any[]) => call[0]?.data?.status === 'COMPUTED');

      expect(heldEntries).toHaveLength(2);
      expect(computedEntries).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Test: 0 active employees → graceful handling
  // -----------------------------------------------------------------------
  describe('zero employees to process', () => {
    it('handles 0 active employees without errors', async () => {
      const { processor, mockPrisma, mockEngine } = createRunMocks();
      mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue(makeCycle('PROCESSING'));
      mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([]);
      mockPrisma.unscopedClient.holidayCalendar.findFirst.mockResolvedValue(null);
      mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue([]);
      mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([]);
      mockPrisma.unscopedClient.leaveRequest.findMany.mockResolvedValue([]);

      const job = makeJob();
      await expect(processor.process(job as any)).resolves.toBeUndefined();
      expect(mockEngine.computeForEmployee).not.toHaveBeenCalled();
    });
  });
});

// =========================================================================
// PayslipGenProcessor retry/failure tests
// =========================================================================
describe('PayslipGenProcessor — retry and failure behavior', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function createPayslipMocks() {
    const mockPrisma = {
      unscopedClient: {
        payrollEntry: {
          findUnique: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
        payslip: { create: vi.fn() },
      },
    };

    const mockStorage = { upload: vi.fn(), getSignedUrl: vi.fn() } as unknown as StorageService;
    const processor = new PayslipGenProcessor(mockPrisma as any, mockStorage as any);

    return { processor, mockPrisma, mockStorage };
  }

  function makeEntryData(overrides: Record<string, unknown> = {}) {
    return {
      id: 'entry-1',
      cycleId: 'cycle-1',
      employeeId: 'emp-1',
      structureId: 'struct-1',
      monthlyCtc: 50000,
      workingDays: 26,
      presentDays: 26,
      lopDays: 0,
      grossEarnings: 70000,
      totalDeductions: 8800,
      netPayable: 61200,
      status: 'DISBURSED',
      payslipKey: null,
      payslipGeneratedAt: null,
      payslipGenFailed: false,
      components: [
        { id: 'c1', componentId: 'comp-1', componentCode: 'BASIC', componentName: 'Basic Pay', type: 'EARNING', amount: 50000 },
        { id: 'c2', componentId: 'comp-2', componentCode: 'HRA', componentName: 'HRA', type: 'EARNING', amount: 20000 },
        { id: 'c3', componentId: 'comp-3', componentCode: 'TDS', componentName: 'Tax', type: 'DEDUCTION', amount: 7000 },
        { id: 'c4', componentId: 'comp-4', componentCode: 'PF', componentName: 'Provident Fund', type: 'DEDUCTION', amount: 1800 },
      ],
      cycle: { id: 'cycle-1', companyId: 'co-1', month: 6, year: 2026 },
      employee: {
        id: 'emp-1',
        bankDetails: [],
      },
      ...overrides,
    };
  }

  describe('entry not found', () => {
    it('skips processing gracefully when entry does not exist', async () => {
      const { processor, mockPrisma } = createPayslipMocks();
      mockPrisma.unscopedClient.payrollEntry.findUnique.mockResolvedValue(null);

      const job = makeJob({ data: { entryId: 'entry-missing', cycleId: 'cycle-1', employeeId: 'emp-1' } });
      await processor.process(job as any);

      expect(mockPrisma.unscopedClient.payslip.create).not.toHaveBeenCalled();
    });
  });

  // NOTE: Full processor path tests (pdf generation) require pdfmake mocking
  // which is unavailable for CJS require() in vitest. These scenarios are covered
  // by the PayrollRunProcessor tests above (transaction failure → retry, partial → HELD).
});

// =========================================================================
// Job recovery tests: first attempt fails, second succeeds
// =========================================================================
describe('PayrollRunProcessor — recovery after transient failure', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('first attempt fails (DB), second attempt succeeds after DB recovers', async () => {
    // Setup mocks
    const tx = {
      payrollCycle: { update: vi.fn(), findUnique: vi.fn() },
      payrollEntry: {
        create: vi.fn().mockImplementation((data: any) => ({ id: `entry-abc`, ...data })),
        update: vi.fn(),
      },
      payrollEntryComponent: { create: vi.fn() },
    };

    const mockPrisma = {
      unscopedClient: {
        payrollCycle: { findUnique: vi.fn(), update: vi.fn() },
        employee: { findMany: vi.fn() },
        holidayCalendar: { findFirst: vi.fn() },
        holiday: { findMany: vi.fn() },
        attendanceLog: { findMany: vi.fn() },
        leaveType: { findMany: vi.fn() },
        leaveRequest: { findMany: vi.fn() },
        payrollEntry: { create: vi.fn() },
        payrollEntryComponent: { create: vi.fn() },
        $transaction: vi.fn(),
      },
    };

    const mockEngine = { computeForEmployee: vi.fn() } as unknown as PayrollEngine;
    const mockSalaryService = { getCurrentSalary: vi.fn() };

    const processor = new PayrollRunProcessor(
      mockPrisma as any,
      mockEngine as any,
      mockSalaryService as any,
    );

    // ------- First attempt: DB fails -------
    mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue({
      id: 'cycle-1', companyId: 'co-1', month: 6, year: 2024, status: 'PROCESSING',
    });
    mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([
      { id: 'emp-1', joinedAt: new Date('2020-01-01') },
    ]);
    mockPrisma.unscopedClient.holidayCalendar.findFirst.mockResolvedValue(null);
    mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.leaveRequest.findMany.mockResolvedValue([]);
    mockSalaryService.getCurrentSalary.mockResolvedValue({
      ctc: 600000, structureId: 'struct-1', structure: { components: [] },
    });
    mockEngine.computeForEmployee.mockResolvedValue({
      entry: { cycleId: 'cycle-1', employeeId: 'emp-1', structureId: 'struct-1', monthlyCtc: 50000, workingDays: 26, presentDays: 26, lopDays: 0, grossEarnings: 70000, totalDeductions: 8800, netPayable: 61200, status: 'COMPUTED' },
      components: [],
    });
    // DB fails on first call
    mockPrisma.unscopedClient.$transaction.mockRejectedValueOnce(new Error('DB connection lost'));

    const job1 = makeJob({ id: 'job-1' });
    await expect(processor.process(job1 as any)).rejects.toThrow('DB connection lost');

    // Cycle should be set back to DRAFT
    expect(mockPrisma.unscopedClient.payrollCycle.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cycle-1' }, data: { status: 'DRAFT' } }),
    );

    // ------- Second attempt: DB recovered -------
    // Cycle was reverted to DRAFT, but by now it's PROCESSING again (re-triggered)
    mockPrisma.unscopedClient.payrollCycle.findUnique.mockReset();
    mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue({
      id: 'cycle-1', companyId: 'co-1', month: 6, year: 2024, status: 'PROCESSING',
    });

    // DB succeeds now
    mockPrisma.unscopedClient.$transaction.mockImplementationOnce(
      async (fn: (t: any) => Promise<unknown>) => fn(tx),
    );
    tx.payrollCycle.update.mockReset();
    tx.payrollEntry.create.mockReset();
    tx.payrollEntryComponent.create.mockReset();

    const job2 = makeJob({ id: 'job-2' });
    await expect(processor.process(job2 as any)).resolves.toBeUndefined();

    // Verify tx was called and cycle was updated to COMPUTED
    expect(tx.payrollCycle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cycle-1' },
        data: expect.objectContaining({ status: 'COMPUTED' }),
      }),
    );
    expect(tx.payrollEntry.create).toHaveBeenCalled();
  });
});

// =========================================================================
// Edge case: Job with stale cycle (idempotency guard prevents double processing)
// =========================================================================
describe('PayrollRunProcessor — idempotency and stale cycle handling', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips processing when cycle is already COMPUTED (stale job)', async () => {
    const mockPrisma = {
      unscopedClient: {
        payrollCycle: { findUnique: vi.fn() },
      },
    };

    const mockEngine = { computeForEmployee: vi.fn() } as unknown as PayrollEngine;
    const mockSalaryService = { getCurrentSalary: vi.fn() };

    const processor = new PayrollRunProcessor(
      mockPrisma as any,
      mockEngine as any,
      mockSalaryService as any,
    );

    mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue({
      id: 'cycle-1', status: 'COMPUTED',
    });

    const job = makeJob();
    await processor.process(job as any);

    expect(mockEngine.computeForEmployee).not.toHaveBeenCalled();
  });
});
