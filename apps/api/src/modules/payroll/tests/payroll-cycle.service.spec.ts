import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, ConflictError, NotFoundError } from '@hr/shared';
import { PayrollCycleService } from '../services/payroll-cycle.service';
import { makeCycle, makeEntry } from './factories';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------
function createMocks() {
  const tx = {
    payrollCycle: { update: vi.fn() },
    payrollEntry: { updateMany: vi.fn() },
  };

  const mockPrisma = {
    unscopedClient: {
      payrollCycle: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      payrollEntry: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      employee: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: (t: any) => Promise<unknown>) => fn(tx)),
    },
  };

  const mockAudit = { record: vi.fn() };
  const mockRunQueue = { add: vi.fn() };
  const mockPayslipQueue = { add: vi.fn() };

  const service = new PayrollCycleService(
    mockPrisma as any,
    mockAudit as any,
    mockRunQueue as any,
    mockPayslipQueue as any,
  );

  return { service, mockPrisma, mockAudit, mockRunQueue, mockPayslipQueue, tx };
}

function makeActor(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'hr-1',
    companyId: 'co-1',
    email: 'hr@test.com',
    roles: ['HR_ADMIN'],
    permissions: ['payroll:read', 'payroll:write'],
    sessionId: 'sess-1',
    traceId: 'trace-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PayrollCycleService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createCycle()', () => {
    it('creates a cycle with status draft', async () => {
      const { service, mockPrisma, mockAudit } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue(null);
      mockPrisma.unscopedClient.payrollCycle.create.mockResolvedValue(
        makeCycle({ id: 'cycle-1', status: 'DRAFT' }),
      );

      const result = await service.createCycle({ month: 6, year: 2026 }, actor);

      expect(mockPrisma.unscopedClient.payrollCycle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DRAFT', month: 6, year: 2026 }),
        }),
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYROLL_CYCLE_CREATED' }),
      );
      expect(result.status).toBe('DRAFT');
    });

    it('throws ConflictError when cycle already exists for same month/year', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findUnique.mockResolvedValue(makeCycle());

      await expect(
        service.createCycle({ month: 6, year: 2026 }, actor),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('runCycle()', () => {
    it('enqueues payroll_run job when cycle status is draft', async () => {
      const { service, mockPrisma, mockRunQueue } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'DRAFT', month: 6, year: 2026 }),
      );

      await service.runCycle('cycle-1', actor);

      expect(mockRunQueue.add).toHaveBeenCalledWith(
        'payroll_run',
        expect.objectContaining({ cycleId: 'cycle-1' }),
      );
    });

    it('sets cycle status to processing before returning', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'DRAFT', month: 6, year: 2026 }),
      );

      const result = await service.runCycle('cycle-1', actor);

      expect(mockPrisma.unscopedClient.payrollCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PROCESSING' }),
        }),
      );
      expect(result.status).toBe('PROCESSING');
    });

    it('writes PAYROLL_CYCLE_RUN_TRIGGERED audit log', async () => {
      const { service, mockPrisma, mockAudit } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'DRAFT', month: 6, year: 2026 }),
      );

      await service.runCycle('cycle-1', actor);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYROLL_CYCLE_RUN_TRIGGERED' }),
      );
    });

    it('throws BadRequestException when cycle is not draft', async () => {
      const { service, mockPrisma, mockRunQueue } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'PROCESSING' }),
      );

      await expect(
        service.runCycle('cycle-1', actor),
      ).rejects.toThrow(BadRequestError);
      expect(mockRunQueue.add).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when cycle not found', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(null);

      await expect(
        service.runCycle('cycle-1', actor),
      ).rejects.toThrow(NotFoundError);
    });

    it('does not enqueue job if status update save throws', async () => {
      const { service, mockPrisma, mockRunQueue } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'DRAFT', month: 6, year: 2026 }),
      );
      mockPrisma.unscopedClient.payrollCycle.update.mockRejectedValue(new Error('DB error'));

      await expect(
        service.runCycle('cycle-1', actor),
      ).rejects.toThrow();
      expect(mockRunQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('approveCycle()', () => {
    it('transitions computed → approved successfully', async () => {
      const { service, mockPrisma, mockAudit, tx } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'COMPUTED', totalGross: 70000, totalDeductions: 8800, totalNet: 61200 }),
      );
      mockPrisma.unscopedClient.payrollEntry.count.mockResolvedValue(0);

      const result = await service.approveCycle('cycle-1', actor);

      expect(tx.payrollCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYROLL_CYCLE_APPROVED' }),
      );
      expect(result.status).toBe('APPROVED');
    });

    it('throws when held entries exist', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'COMPUTED' }),
      );
      mockPrisma.unscopedClient.payrollEntry.count.mockResolvedValue(2);

      await expect(
        service.approveCycle('cycle-1', actor),
      ).rejects.toThrow(BadRequestError);
    });

    it('throws when approving from non-computed status', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'DRAFT' }),
      );

      await expect(
        service.approveCycle('cycle-1', actor),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('disburseCycle()', () => {
    it('transitions approved → disbursed and enqueues payslip jobs', async () => {
      const { service, mockPrisma, mockAudit, mockPayslipQueue, tx } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'APPROVED' }),
      );
      mockPrisma.unscopedClient.payrollEntry.findMany.mockResolvedValue([
        { id: 'entry-1', employeeId: 'emp-1' },
      ]);

      const result = await service.disburseCycle('cycle-1', actor);

      expect(tx.payrollCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DISBURSED' }),
        }),
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYROLL_CYCLE_DISBURSED' }),
      );
      expect(mockPayslipQueue.add).toHaveBeenCalledWith(
        'payslip_gen',
        expect.objectContaining({ entryId: 'entry-1' }),
      );
      expect(result.status).toBe('DISBURSED');
    });

    it('throws when cycle is not approved', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'COMPUTED' }),
      );

      await expect(
        service.disburseCycle('cycle-1', actor),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('reverseCycle()', () => {
    it('transitions approved → reversed', async () => {
      const { service, mockPrisma, mockAudit, tx } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'APPROVED' }),
      );

      const result = await service.reverseCycle('cycle-1', actor, {
        reversalReason: 'Salary error found in computation for June cycle',
      });

      expect(tx.payrollCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REVERSED' }),
        }),
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYROLL_CYCLE_REVERSED' }),
      );
      expect(result.status).toBe('REVERSED');
    });

    it('transitions disbursed → reversed', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'DISBURSED' }),
      );

      const result = await service.reverseCycle('cycle-1', actor, {
        reversalReason: 'Incorrect amounts disbursed for June',
      });

      expect(result.status).toBe('REVERSED');
    });

    it('throws when reversing a draft cycle', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'DRAFT' }),
      );

      await expect(
        service.reverseCycle('cycle-1', actor, { reversalReason: 'Long enough reason for rejection' }),
      ).rejects.toThrow(BadRequestError);
    });

    it('writes reversal reason in audit metadata', async () => {
      const { service, mockPrisma, mockAudit, tx } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status: 'APPROVED' }),
      );

      await service.reverseCycle('cycle-1', actor, {
        reversalReason: 'Incorrect salary computation for June',
      });

      expect(tx.payrollCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reversalReason: 'Incorrect salary computation for June',
          }),
        }),
      );
    });
  });

  // ==================================================================
  // State-Transition Matrix
  // ==================================================================
  describe('state-transition matrix — all valid and invalid transitions', () => {
    // Define the transition table:
    // [fromStatus, action, expectValid]
    // Actions: 'run' | 'approve' | 'disburse' | 'reverse'
    const TRANSITIONS: Array<{ from: string; action: string; valid: boolean }> = [
      // runCycle valid transitions
      { from: 'DRAFT', action: 'run', valid: true },
      // runCycle invalid transitions
      { from: 'PROCESSING', action: 'run', valid: false },
      { from: 'COMPUTED', action: 'run', valid: false },
      { from: 'APPROVED', action: 'run', valid: false },
      { from: 'DISBURSED', action: 'run', valid: false },
      { from: 'REVERSED', action: 'run', valid: false },
      // approveCycle valid transitions
      { from: 'COMPUTED', action: 'approve', valid: true },
      // approveCycle invalid transitions
      { from: 'DRAFT', action: 'approve', valid: false },
      { from: 'PROCESSING', action: 'approve', valid: false },
      { from: 'APPROVED', action: 'approve', valid: false },
      { from: 'DISBURSED', action: 'approve', valid: false },
      { from: 'REVERSED', action: 'approve', valid: false },
      // disburseCycle valid transitions
      { from: 'APPROVED', action: 'disburse', valid: true },
      // disburseCycle invalid transitions
      { from: 'DRAFT', action: 'disburse', valid: false },
      { from: 'PROCESSING', action: 'disburse', valid: false },
      { from: 'COMPUTED', action: 'disburse', valid: false },
      { from: 'DISBURSED', action: 'disburse', valid: false },
      { from: 'REVERSED', action: 'disburse', valid: false },
      // reverseCycle valid transitions
      { from: 'APPROVED', action: 'reverse', valid: true },
      { from: 'DISBURSED', action: 'reverse', valid: true },
      // reverseCycle invalid transitions
      { from: 'DRAFT', action: 'reverse', valid: false },
      { from: 'PROCESSING', action: 'reverse', valid: false },
      { from: 'COMPUTED', action: 'reverse', valid: false },
      { from: 'REVERSED', action: 'reverse', valid: false },
    ];

    const CYCLE_ID = 'cycle-1';

    function createStateMock(status: string) {
      const mocks = createMocks();
      const actor = makeActor();
      mocks.mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(
        makeCycle({ status }),
      );
      // For approve, mock held entries count
      if (status === 'COMPUTED') {
        mocks.mockPrisma.unscopedClient.payrollEntry.count.mockResolvedValue(0);
      }
      // For disburse, mock entries
      if (status === 'APPROVED') {
        mocks.mockPrisma.unscopedClient.payrollEntry.findMany.mockResolvedValue([
          { id: 'entry-1', employeeId: 'emp-1' },
        ]);
      }
      return { ...mocks, actor };
    }

    for (const { from, action, valid } of TRANSITIONS) {
      const testLabel = valid
        ? `ALLOWED: ${from} → ${action}()`
        : `BLOCKED: ${from} → ${action}() throws`;

      it(testLabel, async () => {
        const { service, mockRunQueue, mockPayslipQueue, actor } = createStateMock(from);

        const runAction = async () => {
          switch (action) {
            case 'run':
              return service.runCycle(CYCLE_ID, actor);
            case 'approve':
              return service.approveCycle(CYCLE_ID, actor);
            case 'disburse':
              return service.disburseCycle(CYCLE_ID, actor);
            case 'reverse':
              return service.reverseCycle(CYCLE_ID, actor, {
                reversalReason: 'Testing state transition matrix for audit purposes',
              });
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        };

        if (valid) {
          const result = await runAction();
          expect(result).toBeDefined();
        } else {
          await expect(runAction()).rejects.toThrow();
          // Ensure no queue jobs were enqueued for invalid transitions
          if (action === 'run') expect(mockRunQueue.add).not.toHaveBeenCalled();
          if (action === 'disburse') expect(mockPayslipQueue.add).not.toHaveBeenCalled();
        }
      });
    }
  });
});
