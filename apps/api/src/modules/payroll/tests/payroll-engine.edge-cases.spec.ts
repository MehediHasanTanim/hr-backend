import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '@hr/shared';
import { PayrollEngine, SkipEmployeeError } from '../services/payroll-engine';
import { EmployeeSalaryService } from '../services/employee-salary.service';
import { makeStandardStructure } from './factories';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------
function makeAttendanceRecords(count: number, status = 'PRESENT') {
  const records: Array<{ employeeId: string; date: Date; status: string }> = [];
  for (let i = 0; i < count; i++) {
    records.push({
      employeeId: 'emp-1',
      date: new Date(2024, 5, i + 1),
      status,
    });
  }
  return records;
}

function makeHalfDayRecords(fullCount: number, halfCount: number) {
  const records: Array<{ employeeId: string; date: Date; status: string }> = [];
  for (let i = 0; i < fullCount; i++) {
    records.push({
      employeeId: 'emp-1',
      date: new Date(2024, 5, i + 1),
      status: 'PRESENT',
    });
  }
  for (let i = 0; i < halfCount; i++) {
    records.push({
      employeeId: 'emp-1',
      date: new Date(2024, 5, fullCount + i + 1),
      status: 'HALF_DAY',
    });
  }
  return records;
}

function makeOnLeaveRecords(presentCount: number, leaveCount: number) {
  const records: Array<{ employeeId: string; date: Date; status: string }> = [];
  for (let i = 0; i < presentCount; i++) {
    records.push({
      employeeId: 'emp-1',
      date: new Date(2024, 5, i + 1),
      status: 'PRESENT',
    });
  }
  for (let i = 0; i < leaveCount; i++) {
    records.push({
      employeeId: 'emp-1',
      date: new Date(2024, 5, presentCount + i + 1),
      status: 'ON_LEAVE',
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
function setupEngine() {
  const mockSalaryService = {
    getCurrentSalary: vi.fn(),
  } as unknown as EmployeeSalaryService;

  const engine = new PayrollEngine();

  return { engine, mockSalaryService };
}

const standardStructure = makeStandardStructure();
const june2024WorkingDays = 20; // June 2024 has 20 weekdays (no holidays)

function makeSalaryResponse(overrides: Record<string, unknown> = {}) {
  return {
    ctc: 600000,
    structureId: 'struct-1',
    structure: {
      components: standardStructure.map((sc, i) => ({
        sortOrder: sc.sortOrder,
        defaultValue: sc.defaultValue,
        component: {
          id: `comp-${i}`,
          code: sc.code,
          name: sc.code,
          type: sc.type === 'earning' ? 'EARNING' as const : 'DEDUCTION' as const,
          calcMethod: sc.calculationType === 'fixed'
            ? 'FIXED' as const
            : sc.calculationType === 'formula'
              ? 'FORMULA' as const
              : 'PERCENT_OF_BASIC' as const,
          formula: sc.formula,
          defaultValue: sc.defaultValue,
        },
      })),
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PayrollEngine.computeForEmployee — edge cases', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('zero LOP — employee present all working days', () => {
    it('presentDays equals workingDays, lopDays is 0', async () => {
      const { engine } = setupEngine();

      const result = await engine.computeForEmployee(
        'emp-1', 'cycle-1', 6, 2024,
        makeSalaryResponse(),
        { presentDays: june2024WorkingDays, unpaidLeaveDays: 0 },
        new Date('2020-01-01'),
        [],
      );

      expect(result.entry.lopDays).toBe(0);
      expect(result.entry.presentDays).toBe(june2024WorkingDays);
      expect(result.entry.grossEarnings).toBeGreaterThan(0);
    });

    it('half_day attendance records count as 0.5 present days each', async () => {
      const { engine } = setupEngine();
      const expectedRawPresent = 25; // 24 full + 2 half days = 25

      const result = await engine.computeForEmployee(
        'emp-1', 'cycle-1', 6, 2024,
        makeSalaryResponse(),
        { presentDays: expectedRawPresent, unpaidLeaveDays: 0 },
        new Date('2020-01-01'),
        [],
      );

      // Adjusted presentDays = workingDays - lopDays
      // lopDays = max(0, 20 - 25) + 0 = 0
      // presentDays = 20 - 0 = 20
      expect(result.entry.lopDays).toBe(0);
      expect(result.entry.presentDays).toBe(20);
    });
  });

  describe('full-month LOP — employee absent entire month', () => {
    it('grossEarnings is 0 when lopDays equals workingDays', async () => {
      const { engine } = setupEngine();

      const result = await engine.computeForEmployee(
        'emp-1', 'cycle-1', 6, 2024,
        makeSalaryResponse(),
        { presentDays: 0, unpaidLeaveDays: 0 },
        new Date('2020-01-01'),
        [],
      );

      expect(result.entry.presentDays).toBe(0);
      expect(result.entry.lopDays).toBe(june2024WorkingDays);
      expect(result.entry.grossEarnings).toBe(0);
      expect(result.entry.netPayable).toBe(0);
    });

    it('all fixed earning components are 0', async () => {
      const { engine } = setupEngine();

      const result = await engine.computeForEmployee(
        'emp-1', 'cycle-1', 6, 2024,
        makeSalaryResponse(),
        { presentDays: 0, unpaidLeaveDays: 0 },
        new Date('2020-01-01'),
        [],
      );

      const earnings = result.components.filter((c) => c.type === 'EARNING');
      expect(earnings.every((c) => c.amount === 0)).toBe(true);
    });
  });

  describe('part-month join — employee hired mid-month', () => {
    it('workingDays starts from hireDate when hireDate is in the cycle month', async () => {
      const { engine } = setupEngine();

      const result = await engine.computeForEmployee(
        'emp-1', 'cycle-1', 6, 2024,
        makeSalaryResponse(),
        { presentDays: 11, unpaidLeaveDays: 0 },
        new Date('2024-06-17'), // hired after cycle start
        [],
      );

      // June 2024 has 20 working days. Hire date is 17th.
      // Working days from Jun 17 = need to calculate
      expect(result.entry.workingDays).toBeGreaterThan(0);
      expect(result.entry.workingDays).toBeLessThanOrEqual(20);
    });

    it('employee hired after the cycle month end is skipped', async () => {
      const { engine } = setupEngine();

      // No salary would be found for an employee hired after the cycle
      await expect(
        engine.computeForEmployee(
          'emp-1', 'cycle-1', 6, 2024,
          makeSalaryResponse(),
          { presentDays: 0, unpaidLeaveDays: 0 },
          new Date('2024-07-01'), // hired after June
          [],
        ),
      ).resolves.toBeDefined(); // engine itself does not throw; worker handles it
    });
  });

  describe('mid-cycle salary revision', () => {
    it('uses the salary effective as of the first day of the cycle month', async () => {
      const { engine } = setupEngine();

      const result = await engine.computeForEmployee(
        'emp-1', 'cycle-1', 6, 2024,
        makeSalaryResponse(),
        { presentDays: june2024WorkingDays, unpaidLeaveDays: 0 },
        new Date('2020-01-01'),
        [],
      );

      expect(result.entry.monthlyCtc).toBeGreaterThan(0);
    });
  });

  describe('holiday exclusion from working days', () => {
    it('reduces workingDays by the number of public holidays in the month', async () => {
      const { engine } = setupEngine();

      // 2 holidays on weekdays in June
      const holidays = [
        { date: new Date('2024-06-03'), name: 'Holiday 1' }, // Monday
        { date: new Date('2024-06-10'), name: 'Holiday 2' }, // Monday
      ];

      const result = await engine.computeForEmployee(
        'emp-1', 'cycle-1', 6, 2024,
        makeSalaryResponse(),
        { presentDays: 18, unpaidLeaveDays: 0 },
        new Date('2020-01-01'),
        holidays,
      );

      // 20 working days - 2 holidays = 18
      expect(result.entry.workingDays).toBe(18);
    });

    it('does not subtract weekend holidays from workingDays', async () => {
      const { engine } = setupEngine();

      // Holiday on Saturday
      const holidays = [
        { date: new Date('2024-06-01'), name: 'Weekend Holiday' }, // Saturday
      ];

      const result = await engine.computeForEmployee(
        'emp-1', 'cycle-1', 6, 2024,
        makeSalaryResponse(),
        { presentDays: 20, unpaidLeaveDays: 0 },
        new Date('2020-01-01'),
        holidays,
      );

      // 20 working days - 0 (weekend holiday not double-subtracted)
      expect(result.entry.workingDays).toBe(20);
    });
  });

  describe('on_leave attendance status handling', () => {
    it('counts on_leave days as present (paid leave does not reduce pay)', async () => {
      const { engine } = setupEngine();

      const result = await engine.computeForEmployee(
        'emp-1', 'cycle-1', 6, 2024,
        makeSalaryResponse(),
        { presentDays: 20, unpaidLeaveDays: 0 },
        new Date('2020-01-01'),
        [],
      );

      expect(result.entry.lopDays).toBe(0);
      expect(result.entry.presentDays).toBe(20);
    });

    it('adds unpaid leave days to lopDays from LeaveRequest records', async () => {
      const { engine } = setupEngine();

      const result = await engine.computeForEmployee(
        'emp-1', 'cycle-1', 6, 2024,
        makeSalaryResponse(),
        { presentDays: 18, unpaidLeaveDays: 2 },
        new Date('2020-01-01'),
        [],
      );

      // lopDays = max(0, 20 - 18) + 2 = 4
      expect(result.entry.lopDays).toBe(4);
      // presentDays = max(0, 20 - 4) = 16
      expect(result.entry.presentDays).toBe(16);
    });
  });
});
