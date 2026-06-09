import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import { computePayroll, detectCircularDependency } from '../utils/compute-payroll';
import { round2dp } from '../utils/round2dp';
import { evaluateFormula } from '../utils/formula-validator';

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// fast-check arbitraries — rich domain models
// ---------------------------------------------------------------------------

/** Arbitrary earning component (fixed) */
const earningArb = fc.record({
  code: fc.constantFrom('BASIC', 'HRA', 'SPECIAL', 'MEDICAL', 'BONUS' as const),
  type: fc.constant('EARNING' as const),
  calculationType: fc.constant('fixed' as const),
  formula: fc.constant(null),
  defaultValue: fc.float({ min: 1000, max: 100000, noNaN: true }),
  sortOrder: fc.integer({ min: 1, max: 10 }),
});

/** Arbitrary deduction component (fixed) */
const deductionArb = fc.record({
  code: fc.constantFrom('TDS', 'PF', 'ESI', 'LOAN', 'PROF_TAX' as const),
  type: fc.constant('DEDUCTION' as const),
  calculationType: fc.constant('fixed' as const),
  formula: fc.constant(null),
  defaultValue: fc.float({ min: 100, max: 15000, noNaN: true }),
  sortOrder: fc.integer({ min: 11, max: 20 }),
});

/** Arbitrary formula-based component */
const formulaEarningArb = fc.record({
  code: fc.constantFrom('HRA', 'SPECIAL', 'MEDICAL', 'BONUS' as const),
  type: fc.constant('EARNING' as const),
  calculationType: fc.constant('formula' as const),
  formula: fc.constantFrom(
    'BASIC * 0.4',
    'BASIC * 0.5',
    'BASIC * 0.1',
    '(BASIC + HRA) * 0.1',
    'Math.min(BASIC * 0.12, 1800)',
    'BASIC * 0.08',
  ),
  defaultValue: fc.constant(0),
  sortOrder: fc.integer({ min: 2, max: 10 }),
});

const workingDaysArb = fc.integer({ min: 20, max: 31 });
const lopDaysArb = fc.integer({ min: 0, max: 15 });
const monthlyCtcArb = fc.float({ min: 10000, max: 500000, noNaN: true });

// Seeded for reproducibility
const SEED = 42;

// ---------------------------------------------------------------------------
// Property 1 — netPayable = max(0, grossEarnings - totalDeductions)
// ---------------------------------------------------------------------------
describe('PayrollEngine — property-based invariants', () => {
  it('invariant: netPayable = max(0, grossEarnings - totalDeductions) always', () => {
    fc.assert(
      fc.property(
        fc.array(earningArb, { minLength: 1, maxLength: 4 }),
        fc.array(deductionArb, { minLength: 0, maxLength: 4 }),
        workingDaysArb,
        lopDaysArb,
        (earnings, deductions, workingDays, lopDays) => {
          fc.pre(lopDays <= workingDays);
          const presentDays = workingDays - lopDays;
          const result = computePayroll({
            structureComponents: [...earnings, ...deductions],
            monthlyCTC: 50000,
            workingDays,
            presentDays,
            lopDays,
          });
          const diff = result.grossEarnings - result.totalDeductions;
          const expectedNet = Math.max(0, Math.round(diff * 100) / 100);
          return Math.abs(result.netPayable - expectedNet) < 0.01;
        },
      ),
      { numRuns: 500, seed: SEED },
    );
  });

  // -----------------------------------------------------------------------
  // Property 2 — netPayable >= 0
  // -----------------------------------------------------------------------
  it('invariant: netPayable is never negative (even when deductions exceed earnings)', () => {
    fc.assert(
      fc.property(
        fc.array(earningArb, { minLength: 1, maxLength: 3 }),
        fc.array(deductionArb, { minLength: 1, maxLength: 6 }),
        workingDaysArb,
        lopDaysArb,
        (earnings, deductions, workingDays, lopDays) => {
          fc.pre(lopDays <= workingDays);
          const presentDays = workingDays - lopDays;
          const result = computePayroll({
            structureComponents: [...earnings, ...deductions],
            monthlyCTC: 50000,
            workingDays,
            presentDays,
            lopDays,
          });
          return result.netPayable >= 0;
        },
      ),
      { numRuns: 500, seed: SEED + 1 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 3 — grossEarnings = sum(all earning components)
  // -----------------------------------------------------------------------
  it('invariant: grossEarnings = sum of all earning component amounts', () => {
    fc.assert(
      fc.property(
        fc.array(earningArb, { minLength: 1, maxLength: 5 }),
        fc.array(deductionArb, { minLength: 0, maxLength: 3 }),
        workingDaysArb,
        lopDaysArb,
        (earnings, deductions, workingDays, lopDays) => {
          fc.pre(lopDays <= workingDays);
          const presentDays = workingDays - lopDays;
          const result = computePayroll({
            structureComponents: [...earnings, ...deductions],
            monthlyCTC: 50000,
            workingDays,
            presentDays,
            lopDays,
          });
          const sumEarnings = result.components
            .filter((c) => c.type === 'earning')
            .reduce((acc, c) => acc + c.amount, 0);
          return Math.abs(result.grossEarnings - sumEarnings) < 0.01;
        },
      ),
      { numRuns: 500, seed: SEED + 2 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 4 — LOP reduces fixed components proportionally
  // -----------------------------------------------------------------------
  it('invariant: LOP reduces BASIC proportionally: amount = defaultValue × (presentDays / workingDays)', () => {
    fc.assert(
      fc.property(
        workingDaysArb,
        lopDaysArb,
        monthlyCtcArb,
        (workingDays, lopDays, monthlyCtc) => {
          fc.pre(lopDays <= workingDays);
          fc.pre(workingDays > 0);
          const presentDays = workingDays - lopDays;
          const defaultValue = round2dp(monthlyCtc / 12);
          const result = computePayroll({
            structureComponents: [{
              code: 'BASIC',
              type: 'EARNING',
              calculationType: 'fixed',
              formula: null,
              defaultValue,
              sortOrder: 1,
            }],
            monthlyCTC: monthlyCtc,
            workingDays,
            presentDays,
            lopDays,
          });
          const basicComp = result.components.find((c) => c.code === 'BASIC')!;
          const expected = round2dp(defaultValue * (presentDays / workingDays));
          return Math.abs(basicComp.amount - expected) < 0.01;
        },
      ),
      { numRuns: 500, seed: SEED + 3 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 5 — No negative component amounts
  // -----------------------------------------------------------------------
  it('invariant: each component amount is >= 0 (negative amounts are clamped)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(earningArb, deductionArb), { minLength: 1, maxLength: 8 }),
        workingDaysArb,
        lopDaysArb,
        (components, workingDays, lopDays) => {
          fc.pre(lopDays <= workingDays);
          const presentDays = workingDays - lopDays;
          const result = computePayroll({
            structureComponents: components,
            monthlyCTC: 50000,
            workingDays,
            presentDays,
            lopDays,
          });
          return result.components.every((c) => c.amount >= 0);
        },
      ),
      { numRuns: 500, seed: SEED + 4 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 6 — Full-month LOP: gross = 0
  // -----------------------------------------------------------------------
  it('invariant: gross is 0 when presentDays is 0 (full-month LOP)', () => {
    fc.assert(
      fc.property(
        fc.array(earningArb, { minLength: 1, maxLength: 4 }),
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
      { numRuns: 200, seed: SEED + 5 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 7 — totalDeductions = sum(all deduction component amounts)
  // -----------------------------------------------------------------------
  it('invariant: totalDeductions = sum of all deduction component amounts', () => {
    fc.assert(
      fc.property(
        fc.array(earningArb, { minLength: 1, maxLength: 3 }),
        fc.array(deductionArb, { minLength: 1, maxLength: 5 }),
        workingDaysArb,
        lopDaysArb,
        (earnings, deductions, workingDays, lopDays) => {
          fc.pre(lopDays <= workingDays);
          const presentDays = workingDays - lopDays;
          const result = computePayroll({
            structureComponents: [...earnings, ...deductions],
            monthlyCTC: 50000,
            workingDays,
            presentDays,
            lopDays,
          });
          const sumDeductions = result.components
            .filter((c) => c.type === 'deduction')
            .reduce((acc, c) => acc + c.amount, 0);
          return Math.abs(result.totalDeductions - sumDeductions) < 0.01;
        },
      ),
      { numRuns: 500, seed: SEED + 6 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 8 — netPayable + totalDeductions = grossEarnings (accounting eq)
  // -----------------------------------------------------------------------
  it('invariant: netPayable + totalDeductions = grossEarnings (when net > 0)', () => {
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
          if (result.netPayable > 0) {
            return Math.abs(result.netPayable + result.totalDeductions - result.grossEarnings) < 0.01;
          }
          return result.netPayable === 0;
        },
      ),
      { numRuns: 300, seed: SEED + 7 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 9 — Zero LOP: fixed components = their default values
  // -----------------------------------------------------------------------
  it('invariant: with zero LOP, fixed earning components equal their default values', () => {
    fc.assert(
      fc.property(
        fc.array(earningArb, { minLength: 1, maxLength: 3 }),
        workingDaysArb,
        (earnings, workingDays) => {
          // Deduplicate by code to avoid duplicate component codes
          const codeMap = new Map(earnings.map((e) => [e.code, e]));
          const uniqueEarnings = [...codeMap.values()];
          fc.pre(uniqueEarnings.length > 0);

          const result = computePayroll({
            structureComponents: uniqueEarnings,
            monthlyCTC: 50000,
            workingDays,
            presentDays: workingDays,
            lopDays: 0,
          });
          return result.components
            .filter((c) => c.type === 'earning')
            .every((c) => {
              const original = uniqueEarnings.find((e) => e.code === c.code);
              return original ? Math.abs(c.amount - original.defaultValue) < 0.01 : true;
            });
        },
      ),
      { numRuns: 300, seed: SEED + 8 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 10 — Formula HRA = BASIC * 0.4
  // -----------------------------------------------------------------------
  it('invariant: formula HRA = BASIC * 0.4 holds when both are present', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 10000, max: 200000, noNaN: true }),
        workingDaysArb,
        (basicValue, workingDays) => {
          // Round to 2dp first to avoid double-rounding artifacts
          const roundedBasic = round2dp(basicValue);
          const result = computePayroll({
            structureComponents: [
              { code: 'BASIC', type: 'EARNING', calculationType: 'fixed', formula: null, defaultValue: roundedBasic, sortOrder: 1 },
              { code: 'HRA', type: 'EARNING', calculationType: 'formula', formula: 'BASIC * 0.4', defaultValue: 0, sortOrder: 2 },
            ],
            monthlyCTC: roundedBasic * 12,
            workingDays,
            presentDays: workingDays,
            lopDays: 0,
          });
          const hra = result.components.find((c) => c.code === 'HRA')!;
          const expected = round2dp(roundedBasic * 0.4);
          return Math.abs(hra.amount - expected) <= 0.015;
        },
      ),
      { numRuns: 200, seed: SEED + 9 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 11 — Deductions never exceed earnings (fixed components, sane defaults)
  // -----------------------------------------------------------------------
  it('invariant: with only fixed components where deductions ≤ earnings, deductions never exceed earnings', () => {
    fc.assert(
      fc.property(
        fc.array(earningArb, { minLength: 1, maxLength: 4 }),
        fc.array(deductionArb, { minLength: 1, maxLength: 3 }),
        workingDaysArb,
        (earnings, deductions, workingDays) => {
          const totalDefaultEarnings = earnings.reduce((s, e) => s + e.defaultValue, 0);
          const totalDefaultDeductions = deductions.reduce((s, d) => s + d.defaultValue, 0);
          fc.pre(totalDefaultDeductions <= totalDefaultEarnings);

          const result = computePayroll({
            structureComponents: [...earnings, ...deductions],
            monthlyCTC: 50000,
            workingDays,
            presentDays: workingDays,
            lopDays: 0,
          });

          return result.totalDeductions <= result.grossEarnings + 0.01;
        },
      ),
      { numRuns: 300, seed: SEED + 10 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 12 — Formula evaluation consistency (evaluateFormula vs computePayroll)
  // -----------------------------------------------------------------------
  it('invariant: formula evaluation produces same result as computePayroll for HRA', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 10000, max: 200000, noNaN: true }),
        (basicValue) => {
          const roundedBasic = round2dp(basicValue);
          const formulaResult = evaluateFormula('BASIC * 0.4', { BASIC: roundedBasic });
          const payrollResult = computePayroll({
            structureComponents: [
              { code: 'BASIC', type: 'EARNING', calculationType: 'fixed', formula: null, defaultValue: roundedBasic, sortOrder: 1 },
              { code: 'HRA', type: 'EARNING', calculationType: 'formula', formula: 'BASIC * 0.4', defaultValue: 0, sortOrder: 2 },
            ],
            monthlyCTC: roundedBasic * 12,
            workingDays: 26,
            presentDays: 26,
            lopDays: 0,
          });
          const hraComponent = payrollResult.components.find((c) => c.code === 'HRA')!;
          return Math.abs(formulaResult - hraComponent.amount) <= 0.015;
        },
      ),
      { numRuns: 200, seed: SEED + 11 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property-based: Formula dependency resolution
// ---------------------------------------------------------------------------
describe('Formula dependency resolution — property-based', () => {
  it('invariant: topological order produces correct cascading values (BASIC → HRA → SPECIAL)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 10000, max: 200000, noNaN: true }),
        (basicValue) => {
          const roundedBasic = round2dp(basicValue);
          const result = computePayroll({
            structureComponents: [
              { code: 'BASIC', type: 'EARNING', calculationType: 'fixed', formula: null, defaultValue: roundedBasic, sortOrder: 1 },
              { code: 'HRA', type: 'EARNING', calculationType: 'formula', formula: 'BASIC * 0.4', defaultValue: 0, sortOrder: 2 },
              { code: 'SPECIAL', type: 'EARNING', calculationType: 'formula', formula: 'BASIC + HRA', defaultValue: 0, sortOrder: 3 },
            ],
            monthlyCTC: roundedBasic * 12,
            workingDays: 26,
            presentDays: 26,
            lopDays: 0,
          });
          const hra = result.components.find((c) => c.code === 'HRA')!.amount;
          const special = result.components.find((c) => c.code === 'SPECIAL')!.amount;
          const expectedHra = round2dp(roundedBasic * 0.4);
          const expectedSpecial = round2dp(roundedBasic + expectedHra);
          return Math.abs(hra - expectedHra) <= 0.015 && Math.abs(special - expectedSpecial) <= 0.015;
        },
      ),
      { numRuns: 200, seed: SEED + 12 },
    );
  });

  it('invariant: circular dependency detection rejects self-referencing formula', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 3 }).filter((s) => /^[A-Za-z]+$/.test(s)),
        (code) => {
          const upperCode = code.toUpperCase().trim();
          expect(() => detectCircularDependency([
            { code: upperCode, formula: `${upperCode} * 0.5` },
          ])).toThrow(/circular/i);
        },
      ),
      { numRuns: 50, seed: SEED + 13 },
    );
  });

  it('invariant: Math.min and Math.max cap formulas correctly across ranges', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 5000, max: 200000, noNaN: true }),
        (basicValue) => {
          // PF = Math.min(BASIC * 0.12, 1800)
          const raw = basicValue * 0.12;
          const expectedPF = Math.min(raw, 1800);
          const result = computePayroll({
            structureComponents: [
              { code: 'BASIC', type: 'EARNING', calculationType: 'fixed', formula: null, defaultValue: basicValue, sortOrder: 1 },
              { code: 'PF', type: 'DEDUCTION', calculationType: 'formula', formula: 'Math.min(BASIC * 0.12, 1800)', defaultValue: 0, sortOrder: 2 },
            ],
            monthlyCTC: basicValue * 12,
            workingDays: 26,
            presentDays: 26,
            lopDays: 0,
          });
          const pf = result.components.find((c) => c.code === 'PF')!.amount;
          return Math.abs(pf - round2dp(expectedPF)) < 0.01;
        },
      ),
      { numRuns: 300, seed: SEED + 14 },
    );
  });
});
