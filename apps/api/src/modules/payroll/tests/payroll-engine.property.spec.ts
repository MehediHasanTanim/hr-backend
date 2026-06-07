import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import { computePayroll } from '../utils/compute-payroll';
import { round2dp } from '../utils/round2dp';

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------
const earningArb = fc.record({
  code: fc.constantFrom('BASIC', 'HRA', 'SPECIAL' as const),
  type: fc.constant('EARNING' as const),
  calculationType: fc.constant('fixed' as const),
  formula: fc.constant(null),
  defaultValue: fc.float({ min: 1000, max: 100000, noNaN: true }),
  sortOrder: fc.integer({ min: 1, max: 10 }),
});

const deductionArb = fc.record({
  code: fc.constantFrom('TDS', 'PF', 'ESI' as const),
  type: fc.constant('DEDUCTION' as const),
  calculationType: fc.constant('fixed' as const),
  formula: fc.constant(null),
  defaultValue: fc.float({ min: 0, max: 10000, noNaN: true }),
  sortOrder: fc.integer({ min: 11, max: 20 }),
});

const workingDaysArb = fc.integer({ min: 20, max: 31 });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PayrollEngine — property-based invariants', () => {
  it('invariant: netPayable = max(0, grossEarnings - totalDeductions) always', () => {
    fc.assert(
      fc.property(
        fc.array(earningArb, { minLength: 1, maxLength: 3 }),
        fc.array(deductionArb, { minLength: 0, maxLength: 3 }),
        workingDaysArb,
        (earnings, deductions, workingDays) => {
          const result = computePayroll({
            structureComponents: [...earnings, ...deductions],
            monthlyCTC: 50000,
            workingDays,
            presentDays: workingDays,
            lopDays: 0,
          });
          const diff = result.grossEarnings - result.totalDeductions;
          const expectedNet = Math.max(0, Math.round(diff * 100) / 100);
          return Math.abs(result.netPayable - expectedNet) < 0.01;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('invariant: netPayable is never negative', () => {
    fc.assert(
      fc.property(
        fc.array(earningArb, { minLength: 1, maxLength: 3 }),
        fc.array(deductionArb, { minLength: 0, maxLength: 5 }),
        workingDaysArb,
        (earnings, deductions, workingDays) => {
          const result = computePayroll({
            structureComponents: [...earnings, ...deductions],
            monthlyCTC: 50000,
            workingDays,
            presentDays: workingDays,
            lopDays: 0,
          });
          return result.netPayable >= 0;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('invariant: grossEarnings = sum of all earning component amounts', () => {
    fc.assert(
      fc.property(
        fc.array(earningArb, { minLength: 1, maxLength: 4 }),
        workingDaysArb,
        (earnings, workingDays) => {
          const result = computePayroll({
            structureComponents: earnings,
            monthlyCTC: 50000,
            workingDays,
            presentDays: workingDays,
            lopDays: 0,
          });
          const sumEarnings = result.components
            .filter((c) => c.type === 'earning')
            .reduce((acc, c) => acc + c.amount, 0);
          return Math.abs(result.grossEarnings - sumEarnings) < 0.01;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('invariant: LOP reduces paid_days proportionally', () => {
    fc.assert(
      fc.property(
        workingDaysArb,
        fc.integer({ min: 0, max: 10 }),
        (workingDays, lopDays) => {
          fc.pre(lopDays <= workingDays);
          const presentDays = workingDays - lopDays;
          const defaultValue = 50000;
          const result = computePayroll({
            structureComponents: [{
              code: 'BASIC',
              type: 'EARNING',
              calculationType: 'fixed',
              formula: null,
              defaultValue,
              sortOrder: 1,
            }],
            monthlyCTC: 50000,
            workingDays,
            presentDays,
            lopDays,
          });
          const basicComponent = result.components.find((c) => c.code === 'BASIC')!;
          const expected = round2dp(defaultValue * (presentDays / workingDays));
          return Math.abs(basicComponent.amount - expected) < 0.01;
        },
      ),
      { numRuns: 300 },
    );
  });

  it('invariant: each component amount is >= 0 (no negative components)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(earningArb, deductionArb), { minLength: 1, maxLength: 6 }),
        workingDaysArb,
        (components, workingDays) => {
          const result = computePayroll({
            structureComponents: components,
            monthlyCTC: 50000,
            workingDays,
            presentDays: workingDays,
            lopDays: 0,
          });
          return result.components.every((c) => c.amount >= 0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('invariant: gross is 0 when presentDays is 0 (full-month LOP)', () => {
    fc.assert(
      fc.property(
        fc.array(earningArb, { minLength: 1, maxLength: 3 }),
        workingDaysArb,
        (earnings, workingDays) => {
          const result = computePayroll({
            structureComponents: earnings,
            monthlyCTC: 50000,
            workingDays,
            presentDays: 0,
            lopDays: workingDays,
          });
          return result.grossEarnings === 0;
        },
      ),
      { numRuns: 100 },
    );
  });
});
