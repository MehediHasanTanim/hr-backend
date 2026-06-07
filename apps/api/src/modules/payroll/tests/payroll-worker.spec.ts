import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayrollRunProcessor } from '../processors/payroll-run.processor';
import { PayrollEngine, SkipEmployeeError } from '../services/payroll-engine';
import { makeJob } from './factories';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------
function createRunMocks() {
  const tx = {
    payrollCycle: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    payrollEntry: {
      create: vi.fn().mockImplementation((data: any) => ({
        id: `entry-${Math.random().toString(36).slice(2, 8)}`,
        ...data,
      })),
      update: vi.fn(),
    },
    payrollEntryComponent: {
      create: vi.fn(),
    },
  };

  const mockPrisma = {
    unscopedClient: {
      payrollCycle: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      employee: {
        findMany: vi.fn(),
      },
      holidayCalendar: {
        findFirst: vi.fn(),
      },
      holiday: {
        findMany: vi.fn(),
      },
      attendanceLog: {
        findMany: vi.fn(),
      },
      leaveType: {
        findMany: vi.fn(),
      },
      leaveRequest: {
        findMany: vi.fn(),
      },
      payrollEntry: {
        create: vi.fn(),
      },
      payrollEntryComponent: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (t: any) => Promise<unknown>) => fn(tx)),
    },
  };

  function resetTx() {
    tx.payrollCycle.update.mockReset();
    tx.payrollEntry.create.mockReset();
    tx.payrollEntry.create.mockImplementation((data: any) => ({
      id: `entry-${Math.random().toString(36).slice(2, 8)}`,
      ...data,
    }));
    tx.payrollEntry.update.mockReset();
    tx.payrollEntryComponent.create.mockReset();
  }

  const mockEngine = {
    computeForEmployee: vi.fn(),
  } as unknown as PayrollEngine;

  const mockSalaryService = {
    getCurrentSalary: vi.fn(),
  };

  const processor = new PayrollRunProcessor(
    mockPrisma as any,
    mockEngine as any,
    mockSalaryService as any,
  );

  return { processor, mockPrisma, mockEngine, mockSalaryService, tx, resetTx };
}

function makeValidEntryResult(overrides: Record<string, unknown> = {}) {
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
      ...overrides,
    },
    components: [
      {
        componentId: 'comp-1',
        componentCode: 'BASIC',
        componentName: 'Basic Pay',
        type: 'EARNING' as const,
        amount: 50000,
      },
      {
        componentId: 'comp-2',
        componentCode: 'HRA',
        componentName: 'HRA',
        type: 'EARNING' as const,
        amount: 20000,
      },
    ],
  };
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PayrollRunProcessor.process()', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips job if cycle status is not processing (idempotency guard)', async () => {
    const { processor, mockPrisma, mockEngine } = createRunMocks();
    mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue(
      makeCycle('COMPUTED'),
    );

    const job = makeJob({ data: { cycleId: 'cycle-1', companyId: 'co-1', month: 6, year: 2024, triggeredByUserId: 'hr-1' } });
    await processor.process(job as any);

    expect(mockEngine.computeForEmployee).not.toHaveBeenCalled();
  });

  it('skips job if cycle not found', async () => {
    const { processor, mockPrisma, mockEngine } = createRunMocks();
    mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue(null);

    const job = makeJob();
    await processor.process(job as any);

    expect(mockEngine.computeForEmployee).not.toHaveBeenCalled();
  });

  it('calls computeForEmployee for each active employee', async () => {
    const { processor, mockPrisma, mockEngine, mockSalaryService } = createRunMocks();
    mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue(
      makeCycle('PROCESSING'),
    );
    mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([
      makeEmployee({ id: 'emp-1' }),
      makeEmployee({ id: 'emp-2' }),
      makeEmployee({ id: 'emp-3' }),
    ]);
    mockPrisma.unscopedClient.holidayCalendar.findFirst.mockResolvedValue(null);
    mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.leaveRequest.findMany.mockResolvedValue([]);
    mockSalaryService.getCurrentSalary.mockResolvedValue({
      ctc: 600000,
      structureId: 'struct-1',
      structure: { components: [] },
    });
    mockEngine.computeForEmployee.mockResolvedValue(makeValidEntryResult());

    const job = makeJob();
    await processor.process(job as any);

    expect(mockEngine.computeForEmployee).toHaveBeenCalledTimes(3);
  });

  it('creates a held PayrollEntry when SkipEmployeeError is thrown', async () => {
    const mocks = createRunMocks();
    const { processor, mockPrisma, mockEngine, mockSalaryService, tx } = mocks;
    mocks.resetTx();
    mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue(
      makeCycle('PROCESSING'),
    );
    mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([
      makeEmployee({ id: 'emp-1' }),
      makeEmployee({ id: 'emp-2' }),
    ]);
    mockPrisma.unscopedClient.holidayCalendar.findFirst.mockResolvedValue(null);
    mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.leaveRequest.findMany.mockResolvedValue([]);

    // First employee throws SkipEmployeeError
    mockSalaryService.getCurrentSalary
      .mockRejectedValueOnce(new SkipEmployeeError('No approved salary'))
      .mockResolvedValueOnce({
        ctc: 600000,
        structureId: 'struct-1',
        structure: { components: [] },
      });
    mockEngine.computeForEmployee.mockResolvedValue(makeValidEntryResult());

    const job = makeJob();
    await processor.process(job as any);

    // Both entries saved: one held, one computed
    expect(tx.payrollEntry.create).toHaveBeenCalledTimes(2);
    const heldCall = tx.payrollEntry.create.mock.calls
      .find((call: any[]) => call[0]?.data?.employeeId === 'emp-1');
    expect(heldCall?.[0]?.data).toMatchObject({ status: 'HELD', grossEarnings: 0 });
  });

  it('continues processing remaining employees after SkipEmployeeError', async () => {
    const mocks = createRunMocks();
    const { processor, mockPrisma, mockEngine, mockSalaryService, tx } = mocks;
    mocks.resetTx();
    mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue(
      makeCycle('PROCESSING'),
    );
    mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([
      makeEmployee({ id: 'emp-1' }),
      makeEmployee({ id: 'emp-2' }),
    ]);
    mockPrisma.unscopedClient.holidayCalendar.findFirst.mockResolvedValue(null);
    mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.leaveRequest.findMany.mockResolvedValue([]);

    mockSalaryService.getCurrentSalary
      .mockRejectedValueOnce(new SkipEmployeeError('No approved salary'))
      .mockResolvedValueOnce({
        ctc: 600000,
        structureId: 'struct-1',
        structure: { components: [] },
      });
    mockEngine.computeForEmployee.mockResolvedValue(makeValidEntryResult());

    const job = makeJob();
    await processor.process(job as any);

    expect(mockEngine.computeForEmployee).toHaveBeenCalledTimes(1);
    expect(tx.payrollEntry.create).toHaveBeenCalledTimes(2);
  });

  it('reports job progress', async () => {
    const { processor, mockPrisma, mockEngine, mockSalaryService } = createRunMocks();
    mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue(
      makeCycle('PROCESSING'),
    );
    mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([
      makeEmployee({ id: 'emp-1' }),
    ]);
    mockPrisma.unscopedClient.holidayCalendar.findFirst.mockResolvedValue(null);
    mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.leaveRequest.findMany.mockResolvedValue([]);
    mockSalaryService.getCurrentSalary.mockResolvedValue({
      ctc: 600000,
      structureId: 'struct-1',
      structure: { components: [] },
    });
    mockEngine.computeForEmployee.mockResolvedValue(makeValidEntryResult());

    const job = makeJob();
    await processor.process(job as any);

    expect(job.updateProgress).toHaveBeenCalledWith(expect.any(Number));
  });

  it('handles 0 active employees gracefully', async () => {
    const { processor, mockPrisma, mockEngine } = createRunMocks();
    mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue(
      makeCycle('PROCESSING'),
    );
    mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.holidayCalendar.findFirst.mockResolvedValue(null);
    mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([]);

    const job = makeJob();
    await processor.process(job as any);

    expect(mockEngine.computeForEmployee).not.toHaveBeenCalled();
  });
});
