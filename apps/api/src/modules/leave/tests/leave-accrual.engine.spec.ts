import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { LeaveAccrualEngine } from '../services/leave-accrual.engine';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------
function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: 'emp-1',
    companyId: 'co-1',
    status: 'ACTIVE',
    joinedAt: new Date('2020-01-01'),
    ...overrides,
  } as any;
}

function makeLeaveType(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lt-1',
    companyId: 'co-1',
    accrualType: 'MONTHLY',
    accrualAmount: 1.5,
    maxCarryForward: 5,
    maxBalance: 20,
    isActive: true,
    ...overrides,
  } as any;
}

function makeLeaveBalance(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lb-1',
    employeeId: 'emp-1',
    leaveTypeId: 'lt-1',
    year: 2024,
    entitled: 0,
    used: 0,
    carriedForward: 0,
    balance: 0,
    ...overrides,
  } as any;
}

function makeAccrualRunLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    companyId: 'co-1',
    month: 3,
    year: 2024,
    employeesCount: 1,
    processedAt: new Date(),
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------
function createMocks() {
  const tx = {
    leaveBalance: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    accrualRunLog: {
      create: vi.fn(),
    },
  };

  const mockPrisma = {
    unscopedClient: {
      accrualRunLog: {
        findUnique: vi.fn(),
      },
      employee: {
        findMany: vi.fn(),
      },
      leaveType: {
        findMany: vi.fn(),
      },
      leaveBalance: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx)),
    },
  };

  const mockAudit = {
    record: vi.fn(),
  };

  return { mockPrisma, mockAudit, tx };
}

function createEngine() {
  const { mockPrisma, mockAudit, tx } = createMocks();
  const engine = new LeaveAccrualEngine(mockPrisma as any, mockAudit as any);
  return { engine, mockPrisma, mockAudit, tx };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('LeaveAccrualEngine', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('runForCompany', () => {
    // ---------------------------------------------------------------
    // Annual accrual type
    // ---------------------------------------------------------------
    describe('annual accrual type', () => {
      it('credits full accrualAmount in any month for non-NONE accrualType', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee();
        const leaveType = makeLeaveType({ accrualType: 'ANNUAL', accrualAmount: 15 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);
        tx.leaveBalance.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null);

        await engine.runForCompany('co-1', 1, 2024);

        expect(tx.leaveBalance.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ entitled: 15, balance: 15 }),
          }),
        );
      });

      it('skips employees hired after the current month regardless of accrualType', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee({ joinedAt: new Date('2024-05-01') });
        const leaveType = makeLeaveType({ accrualType: 'ANNUAL', accrualAmount: 15 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);

        await engine.runForCompany('co-1', 3, 2024);

        // Employee hired in May, running for March → not yet active
        expect(tx.leaveBalance.create).not.toHaveBeenCalled();
        expect(tx.leaveBalance.update).not.toHaveBeenCalled();
      });
    });

    // ---------------------------------------------------------------
    // Monthly accrual type
    // ---------------------------------------------------------------
    describe('monthly accrual type', () => {
      it('credits accrualAmount each month for a tenured employee', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee({ joinedAt: new Date('2020-01-01') });
        const leaveType = makeLeaveType({ accrualType: 'MONTHLY', accrualAmount: 1.5 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);
        tx.leaveBalance.findUnique.mockResolvedValue(null); // no existing balance

        await engine.runForCompany('co-1', 3, 2024);

        expect(tx.leaveBalance.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ entitled: 1.5, balance: 1.5 }),
          }),
        );
      });

      it('does not credit an employee hired after the current month', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee({ joinedAt: new Date('2024-05-01') });
        const leaveType = makeLeaveType({ accrualType: 'MONTHLY', accrualAmount: 1.5 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);

        await engine.runForCompany('co-1', 3, 2024);

        expect(tx.leaveBalance.create).not.toHaveBeenCalled();
        expect(tx.leaveBalance.update).not.toHaveBeenCalled();
      });
    });

    // ---------------------------------------------------------------
    // Pro-rated accrual for mid-year hire
    // ---------------------------------------------------------------
    describe('pro-rated accrual for mid-year hire', () => {
      it('pro-rates credit when employee was hired in the current month', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee({ joinedAt: new Date('2024-03-16') });
        const leaveType = makeLeaveType({ accrualType: 'MONTHLY', accrualAmount: 1.5 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);
        tx.leaveBalance.findUnique.mockResolvedValue(null);

        await engine.runForCompany('co-1', 3, 2024);

        // March has 31 days. Hired on 16th → 16 days remaining (16 to 31 inclusive)
        // Expected credit = 1.5 * 16/31 ≈ 0.77 (ROUND_HALF_UP)
        const expected = Math.round((1.5 * 16 / 31 + Number.EPSILON) * 100) / 100;

        expect(tx.leaveBalance.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ entitled: expected }),
          }),
        );
      });

      it('credits full amount when employee was hired on the 1st of the month', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee({ joinedAt: new Date('2024-03-01') });
        const leaveType = makeLeaveType({ accrualType: 'MONTHLY', accrualAmount: 1.5 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);
        tx.leaveBalance.findUnique.mockResolvedValue(null);

        await engine.runForCompany('co-1', 3, 2024);

        expect(tx.leaveBalance.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ entitled: 1.5 }),
          }),
        );
      });

      it('pro-rates correctly for a 28-day month (February non-leap)', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee({ joinedAt: new Date('2023-02-15') });
        const leaveType = makeLeaveType({ accrualType: 'MONTHLY', accrualAmount: 1.5 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);
        tx.leaveBalance.findUnique.mockResolvedValue(null);

        // February 2023 has 28 days. Hired on 15th → 14 days remaining.
        // Expected credit = 1.5 * 14/28 = 0.75
        await engine.runForCompany('co-1', 2, 2023);

        expect(tx.leaveBalance.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ entitled: 0.75 }),
          }),
        );
      });
    });

    // ---------------------------------------------------------------
    // Carry-forward cap at year-end (month=12)
    // ---------------------------------------------------------------
    describe('carry-forward cap at year-end (month=12)', () => {
      it('carries forward up to maxCarryForward and lapses the rest', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee();
        const leaveType = makeLeaveType({
          accrualType: 'MONTHLY',
          accrualAmount: 1.5,
          maxCarryForward: 5,
        });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);

        // Existing balance: entitled=18, used=10, carriedForward=0 → balance=8
        const existingBalance = makeLeaveBalance({
          entitled: 18,
          used: 10,
          carriedForward: 0,
          balance: 8,
        });
        tx.leaveBalance.findUnique
          .mockResolvedValueOnce(existingBalance)   // first lookup (existing)
          .mockResolvedValueOnce(existingBalance)   // second lookup (year-end check)
          .mockResolvedValueOnce(null);             // next year doesn't exist yet

        await engine.runForCompany('co-1', 12, 2024);

        // carryAmount = Math.min(8, 5) = 5
        // Next year balance created with carriedForward = 5
        expect(tx.leaveBalance.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              carriedForward: 5,
              balance: 5,
              year: 2025,
            }),
          }),
        );
      });

      it('carries forward the full balance when balance <= maxCarryForward', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee();
        const leaveType = makeLeaveType({ maxCarryForward: 5 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);

        const existingBalance = makeLeaveBalance({
          entitled: 3, used: 0, carriedForward: 0, balance: 3,
        });
        tx.leaveBalance.findUnique
          .mockResolvedValueOnce(existingBalance)
          .mockResolvedValueOnce(existingBalance)
          .mockResolvedValueOnce(null);

        await engine.runForCompany('co-1', 12, 2024);

        expect(tx.leaveBalance.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ carriedForward: 3, year: 2025 }),
          }),
        );
      });

      it('carries forward 0 when maxCarryForward = 0 (no-carry policy)', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee();
        const leaveType = makeLeaveType({ maxCarryForward: 0 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);

        const existingBalance = makeLeaveBalance({
          entitled: 10, used: 0, carriedForward: 0, balance: 10,
        });
        tx.leaveBalance.findUnique
          .mockResolvedValueOnce(existingBalance)
          .mockResolvedValueOnce(existingBalance)
          .mockResolvedValueOnce(null);

        await engine.runForCompany('co-1', 12, 2024);

        // carriedForward would be Math.min(10, 0) = 0, so no next-year balance created
        // Check that no leaveBalance.create was called with year=2025
        const createCalls = tx.leaveBalance.create.mock.calls.filter(
          (call: any[]) => call[0]?.data?.year === 2025,
        );
        expect(createCalls).toHaveLength(0);
      });

      it('carries forward 0 when balance is 0, skipping next-year creation', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee();
        const leaveType = makeLeaveType({ maxCarryForward: 5 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);

        const existingBalance = makeLeaveBalance({ entitled: 0, used: 0, balance: 0 });
        tx.leaveBalance.findUnique
          .mockResolvedValueOnce(existingBalance)
          .mockResolvedValueOnce(null); // year-end: no balance found (unlikely but covers branch)

        await engine.runForCompany('co-1', 12, 2024);

        // carryAmount = Math.min(0, 5) = 0, so no next-year ops
        const createCalls = tx.leaveBalance.create.mock.calls.filter(
          (call: any[]) => call[0]?.data?.year === 2025,
        );
        expect(createCalls).toHaveLength(0);
      });

      it('does not trigger carry-forward for non-December months', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee();
        const leaveType = makeLeaveType();

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);
        tx.leaveBalance.findUnique.mockResolvedValue(null);

        await engine.runForCompany('co-1', 6, 2024);

        // Only one create for the current year's accrual, not for next year
        const createCalls = tx.leaveBalance.create.mock.calls.filter(
          (call: any[]) => call[0]?.data?.year === 2025,
        );
        expect(createCalls).toHaveLength(0);
      });
    });

    // ---------------------------------------------------------------
    // maxBalance cap
    // ---------------------------------------------------------------
    describe('maxBalance cap', () => {
      it('clamps entitled to maxBalance after crediting', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee();
        const leaveType = makeLeaveType({
          accrualAmount: 2,
          maxBalance: 20,
        });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);

        // Existing: entitled=19, used=0, carriedForward=0 → balance=19
        // New entitled = 19 + 2 = 21, new balance = 21
        // Clamp: min(21, 20) = 20
        const existingBalance = makeLeaveBalance({ entitled: 19, used: 0, balance: 19 });
        tx.leaveBalance.findUnique.mockResolvedValue(existingBalance);

        await engine.runForCompany('co-1', 3, 2024);

        expect(tx.leaveBalance.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ balance: 20 }),
          }),
        );
      });
    });

    // ---------------------------------------------------------------
    // Idempotency guard
    // ---------------------------------------------------------------
    describe('empty result guard', () => {
      it('returns early when no employees found', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([makeLeaveType()]);

        await engine.runForCompany('co-1', 3, 2024);

        expect(tx.leaveBalance.create).not.toHaveBeenCalled();
        expect(debugSpy).toHaveBeenCalled();

        debugSpy.mockRestore();
      });

      it('returns early when no leave types found', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([makeEmployee()]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([]);

        await engine.runForCompany('co-1', 3, 2024);

        expect(tx.leaveBalance.create).not.toHaveBeenCalled();
        expect(debugSpy).toHaveBeenCalled();

        debugSpy.mockRestore();
      });
    });

    describe('new balance creation with maxBalance clamp', () => {
      it('clamps new balance when creditAmount exceeds maxBalance', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee();
        const leaveType = makeLeaveType({ accrualAmount: 25, maxBalance: 20 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);
        tx.leaveBalance.findUnique.mockResolvedValue(null); // no existing

        await engine.runForCompany('co-1', 3, 2024);

        expect(tx.leaveBalance.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ entitled: 25, balance: 20 }),
          }),
        );
      });
    });

    describe('existing balance update path', () => {
      it('updates existing balance with new entitled and clamps to maxBalance', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee();
        const leaveType = makeLeaveType({ accrualAmount: 2, maxBalance: 20 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);

        const existingBalance = makeLeaveBalance({ entitled: 19, used: 0, balance: 19 });
        tx.leaveBalance.findUnique.mockResolvedValue(existingBalance);

        await engine.runForCompany('co-1', 3, 2024);

        expect(tx.leaveBalance.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'lb-1' },
            data: expect.objectContaining({
              entitled: 21,
              balance: 20,
            }),
          }),
        );
      });
    });

    describe('year-end carry-forward with existing next-year balance', () => {
      it('updates existing next-year balance when carry-forward applies', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee();
        const leaveType = makeLeaveType({ maxCarryForward: 5 });

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);

        const currentBalance = makeLeaveBalance({ entitled: 10, used: 2, balance: 8 });
        const nextYearBalance = makeLeaveBalance({
          id: 'lb-2025', year: 2025,
          entitled: 5, used: 1, carriedForward: 0, balance: 4,
        });
        // Three lookups: existing check, year-end carry-forward check, next-year lookup
        tx.leaveBalance.findUnique
          .mockResolvedValueOnce(currentBalance)    // existing check
          .mockResolvedValueOnce(currentBalance)    // year-end check
          .mockResolvedValueOnce(nextYearBalance);  // next-year exists

        await engine.runForCompany('co-1', 12, 2024);

        expect(tx.leaveBalance.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'lb-2025' },
            data: expect.objectContaining({
              carriedForward: 5,
              balance: 9, // 5 + 5 - 1 = 9
            }),
          }),
        );
      });
    });

    describe('idempotency guard', () => {
      it('skips processing if AccrualRunLog already exists for same company/month/year', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(makeAccrualRunLog());

        await engine.runForCompany('co-1', 3, 2024);

        expect(mockPrisma.unscopedClient.employee.findMany).not.toHaveBeenCalled();
        expect(tx.leaveBalance.create).not.toHaveBeenCalled();
        expect(tx.leaveBalance.update).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
      });

      it('creates AccrualRunLog record on successful run', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const employee = makeEmployee();
        const leaveType = makeLeaveType();

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);
        tx.leaveBalance.findUnique.mockResolvedValue(null);

        await engine.runForCompany('co-1', 3, 2024);

        expect(tx.accrualRunLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              companyId: 'co-1',
              month: 3,
              year: 2024,
            }),
          }),
        );
      });
    });

    // ---------------------------------------------------------------
    // Error resilience
    // ---------------------------------------------------------------
    describe('error resilience', () => {
      it('continues processing remaining employees when one fails', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const emp1 = makeEmployee({ id: 'emp-1' });
        const emp2 = makeEmployee({ id: 'emp-2' });
        const emp3 = makeEmployee({ id: 'emp-3' });
        const leaveType = makeLeaveType();

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([emp1, emp2, emp3]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);

        tx.leaveBalance.findUnique
          .mockResolvedValueOnce(null)  // emp-1: no existing balance
          .mockRejectedValueOnce(new Error('DB error'))  // emp-2: fails
          .mockResolvedValueOnce(null); // emp-3: no existing balance

        await expect(engine.runForCompany('co-1', 3, 2024)).rejects.toThrow(/partial|error/);

        // emp-1 and emp-3 should have been processed
        expect(tx.leaveBalance.create).toHaveBeenCalledTimes(2);
        expect(tx.leaveBalance.create).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            data: expect.objectContaining({ employeeId: 'emp-1' }),
          }),
        );
        expect(tx.leaveBalance.create).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            data: expect.objectContaining({ employeeId: 'emp-3' }),
          }),
        );
      });

      it('handles non-Error thrown values gracefully', async () => {
        const { engine, mockPrisma, tx } = createEngine();
        const emp1 = makeEmployee({ id: 'emp-1' });
        const emp2 = makeEmployee({ id: 'emp-2' });
        const leaveType = makeLeaveType();

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([emp1, emp2]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);

        tx.leaveBalance.findUnique
          .mockResolvedValueOnce(null)
          .mockRejectedValueOnce('raw string error'); // non-Error thrown

        await expect(engine.runForCompany('co-1', 3, 2024)).rejects.toThrow(/partial|error/);

        // emp-1 should have been processed
        expect(tx.leaveBalance.create).toHaveBeenCalledTimes(1);
      });
    });

    // ---------------------------------------------------------------
    // Audit log
    // ---------------------------------------------------------------
    describe('audit log', () => {
      it('writes LEAVE_ACCRUAL_RUN audit log on success with correct metadata', async () => {
        const { engine, mockPrisma, mockAudit, tx } = createEngine();
        const employee = makeEmployee();
        const leaveType = makeLeaveType();

        mockPrisma.unscopedClient.accrualRunLog.findUnique.mockResolvedValue(null);
        mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([employee]);
        mockPrisma.unscopedClient.leaveType.findMany.mockResolvedValue([leaveType]);
        tx.leaveBalance.findUnique.mockResolvedValue(null);

        await engine.runForCompany('co-1', 3, 2024);

        expect(mockAudit.record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'LEAVE_ACCRUAL_RUN',
            companyId: 'co-1',
            newValue: expect.objectContaining({
              month: 3,
              year: 2024,
              employeesProcessed: expect.any(Number),
            }),
          }),
        );
      });
    });
  });
});
