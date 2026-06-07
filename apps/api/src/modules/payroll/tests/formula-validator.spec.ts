import { describe, it, expect, afterEach } from 'vitest';
import { BadRequestError } from '@hr/shared';
import { validateFormula, evaluateFormula } from '../utils/formula-validator';
import { FormulaEvaluationError } from '../services/payroll-engine';
import { computePayroll, detectCircularDependency } from '../utils/compute-payroll';

afterEach(() => {
  vi.clearAllMocks();
});

const KNOWN_CODES = ['BASIC', 'HRA', 'TDS', 'PF'];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('validateFormula()', () => {
  describe('valid formulas', () => {
    it('accepts simple multiplication: "BASIC * 0.4"', () => {
      expect(() => validateFormula('BASIC * 0.4', KNOWN_CODES)).not.toThrow();
    });

    it('accepts Math.min with two arguments', () => {
      expect(() =>
        validateFormula('Math.min(BASIC * 0.12, 1800)', KNOWN_CODES),
      ).not.toThrow();
    });

    it('accepts Math.max', () => {
      expect(() =>
        validateFormula('Math.max(BASIC * 0.1, 500)', KNOWN_CODES),
      ).not.toThrow();
    });

    it('accepts Math.floor and Math.ceil', () => {
      expect(() =>
        validateFormula('Math.floor(BASIC / 26)', KNOWN_CODES),
      ).not.toThrow();
      expect(() =>
        validateFormula('Math.ceil(BASIC / 26)', KNOWN_CODES),
      ).not.toThrow();
    });

    it('accepts numeric literals without variable references', () => {
      expect(() => validateFormula('1500', KNOWN_CODES)).not.toThrow();
    });

    it('accepts formula referencing multiple known codes', () => {
      expect(() =>
        validateFormula('(BASIC + HRA) * 0.1', KNOWN_CODES),
      ).not.toThrow();
    });

    it('accepts parenthesised expressions', () => {
      expect(() =>
        validateFormula('(BASIC * 0.4) + (HRA * 0.1)', KNOWN_CODES),
      ).not.toThrow();
    });
  });

  describe('unknown variable → validation error', () => {
    it('throws when formula references an unknown component code', () => {
      expect(() =>
        validateFormula('UNKNOWN_CODE * 0.5', ['BASIC']),
      ).toThrow(BadRequestError);
    });

    it('throws when formula references a code not yet in the structure', () => {
      expect(() =>
        validateFormula('BASIC + ALLOWANCE', ['BASIC']),
      ).toThrow(/unknown.*token|unknown.*variable/i);
    });

    it('error message names the unknown token', () => {
      try {
        validateFormula('BASIC + GHOST * 0.1', ['BASIC']);
        expect.unreachable('expected to throw');
      } catch (err: any) {
        expect(err.message).toMatch(/GHOST/);
      }
    });
  });

  describe('disallowed keywords → security rejection', () => {
    const dangerous = [
      'eval("1+1")',
      'require("fs")',
      'process.env.SECRET',
      'global.something',
      '__proto__.polluted',
      'constructor.name',
      'import("module")',
    ];

    it.each(dangerous)('rejects formula containing "%s"', (formula) => {
      expect(() => validateFormula(formula, ['BASIC'])).toThrow(BadRequestError);
      expect(() => validateFormula(formula, ['BASIC'])).toThrow(/disallowed|forbidden|not allowed/i);
    });
  });

  describe('circular reference → error', () => {
    it('detects direct self-reference', () => {
      const components = [
        { code: 'A', formula: 'A * 0.5' },
        { code: 'B', formula: 'C * 0.5' },
        { code: 'C', formula: 'B * 0.5' },
      ];
      expect(() => detectCircularDependency(components)).toThrow(/circular/i);
    });

    it('detects indirect circular reference', () => {
      const components = [
        { code: 'A', formula: 'B * 0.5' },
        { code: 'B', formula: 'C * 0.5' },
        { code: 'C', formula: 'A * 0.5' },
      ];
      expect(() => detectCircularDependency(components)).toThrow(/circular/i);
    });

    it('does not false-positive on valid forward references', () => {
      const components = [
        { code: 'BASIC', formula: null },
        { code: 'HRA', formula: 'BASIC * 0.4' },
      ];
      expect(() => detectCircularDependency(components)).not.toThrow();

      // Also verify computePayroll works
      const result = computePayroll({
        structureComponents: [
          { code: 'BASIC', type: 'EARNING', calculationType: 'fixed', formula: null, defaultValue: 50000, sortOrder: 1 },
          { code: 'HRA', type: 'EARNING', calculationType: 'formula', formula: 'BASIC * 0.4', defaultValue: 0, sortOrder: 2 },
        ],
        monthlyCTC: 50000,
        workingDays: 26,
        presentDays: 26,
        lopDays: 0,
      });
      expect(result.components.find((c) => c.code === 'HRA')!.amount).toBe(20000);
    });
  });
});

describe('formula evaluation correctness', () => {
  it('"BASIC * 0.4" evaluates to 20000 when BASIC = 50000', () => {
    const context = { BASIC: 50000 };
    expect(evaluateFormula('BASIC * 0.4', context)).toBe(20000);
  });

  it('"Math.min(BASIC * 0.12, 1800)" caps at 1800 when BASIC = 50000', () => {
    const context = { BASIC: 50000 };
    expect(evaluateFormula('Math.min(BASIC * 0.12, 1800)', context)).toBe(1800);
  });

  it('"Math.min(BASIC * 0.12, 1800)" returns actual when BASIC is low', () => {
    const context = { BASIC: 10000 };
    expect(evaluateFormula('Math.min(BASIC * 0.12, 1800)', context)).toBe(1200);
  });

  it('result is rounded to 2 decimal places', () => {
    const context = { BASIC: 50000 };
    const result = evaluateFormula('Math.round(BASIC * 23 / 26 * 100) / 100', context);
    expect(result).toBe(44230.77);
  });

  it('throws FormulaEvaluationError on division by zero', () => {
    const context = { WORKING_DAYS: 0 };
    expect(() =>
      evaluateFormula('BASIC / WORKING_DAYS', context),
    ).toThrow(FormulaEvaluationError);
  });

  it('throws FormulaEvaluationError when referenced variable not in context', () => {
    const context = { BASIC: 50000 };
    expect(() =>
      evaluateFormula('BASIC + MISSING_VAR', context),
    ).toThrow(FormulaEvaluationError);
  });
});
