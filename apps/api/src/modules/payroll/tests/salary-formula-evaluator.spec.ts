import { describe, it, expect, afterEach } from 'vitest';
import { BadRequestError } from '@hr/shared';
import { validateFormula, evaluateFormula } from '../utils/formula-validator';
import { FormulaEvaluationError } from '../services/payroll-engine';
import { computePayroll, detectCircularDependency } from '../utils/compute-payroll';
import { round2dp } from '../utils/round2dp';

afterEach(() => {
  vi.clearAllMocks();
});

const KNOWN_CODES = ['BASIC', 'HRA', 'SPECIAL', 'TDS', 'PF', 'ESI', 'BONUS'];

// =========================================================================
// Formula Validation Tests
// =========================================================================
describe('SalaryFormulaEvaluator — validateFormula()', () => {
  // -----------------------------------------------------------------------
  // Valid formulas
  // -----------------------------------------------------------------------
  describe('valid formulas accepted', () => {
    const validFormulas: Array<{ expr: string; desc: string }> = [
      { expr: 'BASIC * 0.4', desc: 'simple multiplication' },
      { expr: 'BASIC + HRA', desc: 'addition of two codes' },
      { expr: '(BASIC + HRA) * 0.1', desc: 'parenthesised addition with multiplication' },
      { expr: 'BASIC * 0.5 + HRA * 0.3', desc: 'multiple terms' },
      { expr: 'Math.min(BASIC * 0.12, 1800)', desc: 'Math.min with cap' },
      { expr: 'Math.max(BASIC * 0.1, 500)', desc: 'Math.max with floor' },
      { expr: 'Math.floor(BASIC / 26)', desc: 'Math.floor for rounding' },
      { expr: 'Math.ceil(BASIC / 26)', desc: 'Math.ceil for rounding' },
      { expr: 'Math.round(BASIC / 26 * 100) / 100', desc: 'Math.round for 2dp' },
      { expr: 'Math.abs(-BASIC)', desc: 'Math.abs for absolute value' },
      { expr: 'BASIC * 0.4 + HRA * 0.1', desc: 'mixed operations' },
      { expr: '(BASIC - TDS) * 0.1', desc: 'subtraction in parentheses' },
      { expr: 'BASIC / 26 * PF', desc: 'division with another component' },
      { expr: '1500', desc: 'numeric literal' },
      { expr: 'BASIC * 0.12 - PF', desc: 'subtracting another component' },
      { expr: 'PI', desc: 'Math.PI constant' },
      { expr: 'Math.PI * BASIC / 180', desc: 'Math.PI in expression' },
    ];

    it.each(validFormulas)('accepts: $desc ($expr)', ({ expr }) => {
      expect(() => validateFormula(expr, KNOWN_CODES)).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Invalid - unknown variables
  // -----------------------------------------------------------------------
  describe('unknown variables rejected', () => {
    const invalidVariables: Array<{ expr: string; expectedToken: string }> = [
      { expr: 'UNKNOWN_CODE * 0.5', expectedToken: 'UNKNOWN_CODE' },
      { expr: 'BASIC + ALLOWANCE', expectedToken: 'ALLOWANCE' },
      { expr: 'BASIC + GHOST * 0.1', expectedToken: 'GHOST' },
      { expr: 'XYZ + BASIC', expectedToken: 'XYZ' },
    ];

    it.each(invalidVariables)('rejects unknown token "$expectedToken" in "$expr"', ({ expr, expectedToken }) => {
      expect(() => validateFormula(expr, ['BASIC'])).toThrow(BadRequestError);
      expect(() => validateFormula(expr, ['BASIC'])).toThrow(
        new RegExp(expectedToken, 'i'),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Security: disallowed keywords
  // -----------------------------------------------------------------------
  describe('security — disallowed keywords rejected', () => {
    const dangerous: Array<{ expr: string; kw: string }> = [
      { expr: 'eval("1+1")', kw: 'eval' },
      { expr: 'require("fs")', kw: 'require' },
      { expr: 'process.env.SECRET', kw: 'process' },
      { expr: 'global.something', kw: 'global' },
      { expr: '__proto__.polluted', kw: '__proto__' },
      { expr: 'constructor.name', kw: 'constructor' },
      { expr: 'import("module")', kw: 'import' },
      { expr: 'window.location', kw: 'window' },
      { expr: 'document.cookie', kw: 'document' },
      { expr: 'prototype.chain', kw: 'prototype' },
    ];

    it.each(dangerous)('rejects formula containing "$kw"', ({ expr, kw }) => {
      expect(() => validateFormula(expr, KNOWN_CODES)).toThrow(BadRequestError);
      expect(() => validateFormula(expr, KNOWN_CODES)).toThrow(
        new RegExp(kw, 'i'),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases: empty/null/whitespace
  // -----------------------------------------------------------------------
  describe('empty or null formulas rejected', () => {
    it('rejects empty string', () => {
      expect(() => validateFormula('', KNOWN_CODES)).toThrow(BadRequestError);
    });

    it('rejects whitespace-only string', () => {
      expect(() => validateFormula('   ', KNOWN_CODES)).toThrow(BadRequestError);
    });

    it('rejects null/undefined formula', () => {
      // @ts-expect-error Testing runtime null input
      expect(() => validateFormula(null, KNOWN_CODES)).toThrow(BadRequestError);
      // @ts-expect-error Testing runtime undefined input
      expect(() => validateFormula(undefined, KNOWN_CODES)).toThrow(BadRequestError);
    });
  });
});

// =========================================================================
// Formula Evaluation Tests (runtime)
// =========================================================================
describe('SalaryFormulaEvaluator — evaluateFormula()', () => {
  // -----------------------------------------------------------------------
  // Basic arithmetic
  // -----------------------------------------------------------------------
  describe('basic arithmetic evaluation', () => {
    it('"BASIC * 0.4" = 20000 when BASIC = 50000', () => {
      expect(evaluateFormula('BASIC * 0.4', { BASIC: 50000 })).toBe(20000);
    });

    it('"(BASIC + HRA) * 0.1" = 7000 when BASIC=50000, HRA=20000', () => {
      expect(evaluateFormula('(BASIC + HRA) * 0.1', { BASIC: 50000, HRA: 20000 })).toBe(7000);
    });

    it('"BASIC - TDS" = 40000 when BASIC=50000, TDS=10000', () => {
      expect(evaluateFormula('BASIC - TDS', { BASIC: 50000, TDS: 10000 })).toBe(40000);
    });

    it('"BASIC / 26" = 1923.08 when BASIC=50000', () => {
      const result = evaluateFormula('BASIC / 26', { BASIC: 50000 });
      expect(result).toBeCloseTo(1923.08, 1);
    });

    it('"BASIC * (23/26)" = 44230.77', () => {
      expect(evaluateFormula('BASIC * (23 / 26)', { BASIC: 50000 })).toBeCloseTo(44230.77, 1);
    });

    it('"BASIC * 0.5 + HRA * 0.3" = 31000 when BASIC=50000, HRA=20000', () => {
      expect(evaluateFormula('BASIC * 0.5 + HRA * 0.3', { BASIC: 50000, HRA: 20000 })).toBe(31000);
    });
  });

  // -----------------------------------------------------------------------
  // Math helpers
  // -----------------------------------------------------------------------
  describe('Math helper functions', () => {
    it('Math.min caps at upper bound', () => {
      expect(evaluateFormula('Math.min(BASIC * 0.12, 1800)', { BASIC: 50000 })).toBe(1800);
    });

    it('Math.min returns actual when below cap', () => {
      expect(evaluateFormula('Math.min(BASIC * 0.12, 1800)', { BASIC: 10000 })).toBe(1200);
    });

    it('Math.max floors at lower bound', () => {
      expect(evaluateFormula('Math.max(BASIC * 0.1, 500)', { BASIC: 3000 })).toBe(500);
    });

    it('Math.max returns actual when above floor', () => {
      expect(evaluateFormula('Math.max(BASIC * 0.1, 500)', { BASIC: 10000 })).toBe(1000);
    });

    it('Math.floor rounds down', () => {
      // 50000 / 26 = 1923.0769 → floor = 1923
      const result = evaluateFormula('Math.floor(BASIC / 26)', { BASIC: 50000 });
      expect(result).toBe(1923);
      expect(result).toBeLessThanOrEqual(50000 / 26);
    });

    it('Math.ceil rounds up', () => {
      // 50000 / 26 = 1923.0769 → ceil = 1924
      const result = evaluateFormula('Math.ceil(BASIC / 26)', { BASIC: 50000 });
      expect(result).toBe(1924);
      expect(result).toBeGreaterThanOrEqual(50000 / 26);
    });

    it('Math.round rounds to nearest integer', () => {
      expect(evaluateFormula('Math.round(BASIC / 26)', { BASIC: 50000 })).toBe(1923);
      expect(evaluateFormula('Math.round(BASIC / 26)', { BASIC: 50100 })).toBe(1927);
    });

    it('Math.abs returns positive for negative expression', () => {
      expect(evaluateFormula('Math.abs(BASIC - 100000)', { BASIC: 50000 })).toBe(50000);
    });
  });

  // -----------------------------------------------------------------------
  // Precision
  // -----------------------------------------------------------------------
  describe('precision and rounding', () => {
    it('result is rounded to 2 decimal places', () => {
      const result = evaluateFormula('BASIC * 23 / 26', { BASIC: 50000 });
      // 50000 * 23 / 26 = 44230.7692... → rounded to 44230.77
      expect(result).toBeCloseTo(44230.77, 2);
      // Verify it has at most 2 decimal places
      expect(String(result).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
    });

    it('result is never negative (clamped to 0)', () => {
      expect(evaluateFormula('BASIC - 100000', { BASIC: 50000 })).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Error cases
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('throws FormulaEvaluationError on division by zero', () => {
      expect(() =>
        evaluateFormula('BASIC / WORKING_DAYS', { BASIC: 50000, WORKING_DAYS: 0 }),
      ).toThrow(FormulaEvaluationError);
    });

    it('throws FormulaEvaluationError when referenced variable not in context', () => {
      expect(() =>
        evaluateFormula('BASIC + MISSING_VAR', { BASIC: 50000 }),
      ).toThrow(FormulaEvaluationError);
    });

    it('throws FormulaEvaluationError for invalid syntax at runtime', () => {
      expect(() =>
        evaluateFormula('BASIC **', { BASIC: 50000 }),
      ).toThrow(FormulaEvaluationError);
    });

    it('throws FormulaEvaluationError for malformed parentheses', () => {
      expect(() =>
        evaluateFormula('(BASIC + HRA', { BASIC: 50000, HRA: 20000 }),
      ).toThrow(FormulaEvaluationError);
    });
  });
});

// =========================================================================
// Circular Dependency Detection Tests
// =========================================================================
describe('SalaryFormulaEvaluator — detectCircularDependency()', () => {
  describe('circular references detected', () => {
    it('detects direct self-reference: A = A * 0.5', () => {
      expect(() => detectCircularDependency([
        { code: 'A', formula: 'A * 0.5' },
      ])).toThrow(/circular/i);
    });

    it('detects two-component cycle: A = B * 0.5, B = A * 0.5', () => {
      expect(() => detectCircularDependency([
        { code: 'A', formula: 'B * 0.5' },
        { code: 'B', formula: 'A * 0.5' },
      ])).toThrow(/circular/i);
    });

    it('detects three-component cycle: A → B → C → A', () => {
      expect(() => detectCircularDependency([
        { code: 'A', formula: 'B * 0.5' },
        { code: 'B', formula: 'C * 0.5' },
        { code: 'C', formula: 'A * 0.5' },
      ])).toThrow(/circular/i);
    });

    it('detects longer chain cycle: A → B → C → D → A', () => {
      expect(() => detectCircularDependency([
        { code: 'A', formula: 'B * 0.5' },
        { code: 'B', formula: 'C * 0.5' },
        { code: 'C', formula: 'D * 0.5' },
        { code: 'D', formula: 'A * 0.5' },
      ])).toThrow(/circular/i);
    });

    it('detects self-reference with complex expression', () => {
      expect(() => detectCircularDependency([
        { code: 'A', formula: 'A * 0.4 + B' },
        { code: 'B', formula: '1000' },
      ])).toThrow(/circular/i);
    });
  });

  describe('no false positives on valid structures', () => {
    it('accepts forward reference: BASIC → HRA', () => {
      expect(() => detectCircularDependency([
        { code: 'BASIC', formula: null },
        { code: 'HRA', formula: 'BASIC * 0.4' },
      ])).not.toThrow();
    });

    it('accepts chained forward references: BASIC → HRA → SPECIAL', () => {
      expect(() => detectCircularDependency([
        { code: 'BASIC', formula: null },
        { code: 'HRA', formula: 'BASIC * 0.4' },
        { code: 'SPECIAL', formula: 'BASIC + HRA' },
      ])).not.toThrow();
    });

    it('accepts independent components with no cross-references', () => {
      expect(() => detectCircularDependency([
        { code: 'BASIC', formula: null },
        { code: 'TDS', formula: null },
        { code: 'PF', formula: null },
      ])).not.toThrow();
    });

    it('accepts formula referencing system variables only', () => {
      expect(() => detectCircularDependency([
        { code: 'BASIC', formula: 'MONTHLY_CTC / 12' },
      ])).not.toThrow();
    });
  });
});

// =========================================================================
// Dependency Resolution (Topological evaluation order)
// =========================================================================
describe('SalaryFormulaEvaluator — dependency resolution', () => {
  it('resolves simple chain: BASIC=50000 → HRA=20000 → SPECIAL=70000', () => {
    const result = computePayroll({
      structureComponents: [
        { code: 'BASIC', type: 'EARNING', calculationType: 'fixed', formula: null, defaultValue: 50000, sortOrder: 1 },
        { code: 'HRA', type: 'EARNING', calculationType: 'formula', formula: 'BASIC * 0.4', defaultValue: 0, sortOrder: 2 },
        { code: 'SPECIAL', type: 'EARNING', calculationType: 'formula', formula: 'BASIC + HRA', defaultValue: 0, sortOrder: 3 },
      ],
      monthlyCTC: 600000,
      workingDays: 26,
      presentDays: 26,
      lopDays: 0,
    });

    expect(result.components.find((c) => c.code === 'BASIC')!.amount).toBe(50000);
    expect(result.components.find((c) => c.code === 'HRA')!.amount).toBe(20000);
    expect(result.components.find((c) => c.code === 'SPECIAL')!.amount).toBe(70000);
  });

  it('resolves regardless of declaration order', () => {
    // SPECIAL depends on HRA which depends on BASIC, but declared in reverse order
    const result = computePayroll({
      structureComponents: [
        { code: 'SPECIAL', type: 'EARNING', calculationType: 'formula', formula: 'BASIC + HRA', defaultValue: 0, sortOrder: 3 },
        { code: 'HRA', type: 'EARNING', calculationType: 'formula', formula: 'BASIC * 0.4', defaultValue: 0, sortOrder: 2 },
        { code: 'BASIC', type: 'EARNING', calculationType: 'fixed', formula: null, defaultValue: 50000, sortOrder: 1 },
      ],
      monthlyCTC: 600000,
      workingDays: 26,
      presentDays: 26,
      lopDays: 0,
    });

    expect(result.components.find((c) => c.code === 'BASIC')!.amount).toBe(50000);
    expect(result.components.find((c) => c.code === 'HRA')!.amount).toBe(20000);
    expect(result.components.find((c) => c.code === 'SPECIAL')!.amount).toBe(70000);
  });

  it('resolves complex chain with mixed fixed and formula components', () => {
    const result = computePayroll({
      structureComponents: [
        { code: 'BASIC', type: 'EARNING', calculationType: 'fixed', formula: null, defaultValue: 30000, sortOrder: 1 },
        { code: 'HRA', type: 'EARNING', calculationType: 'formula', formula: 'BASIC * 0.4', defaultValue: 0, sortOrder: 2 },
        { code: 'BONUS', type: 'EARNING', calculationType: 'fixed', formula: null, defaultValue: 5000, sortOrder: 3 },
        { code: 'TDS', type: 'DEDUCTION', calculationType: 'formula', formula: '(BASIC + HRA + BONUS) * 0.1', defaultValue: 0, sortOrder: 4 },
        { code: 'PF', type: 'DEDUCTION', calculationType: 'formula', formula: 'Math.min(BASIC * 0.12, 1800)', defaultValue: 0, sortOrder: 5 },
      ],
      monthlyCTC: 360000,
      workingDays: 26,
      presentDays: 26,
      lopDays: 0,
    });

    // BASIC = 30000, HRA = 12000, BONUS = 5000
    // Gross = 47000
    // TDS = (30000 + 12000 + 5000) * 0.1 = 4700
    // PF = min(30000 * 0.12, 1800) = min(3600, 1800) = 1800
    // Net = 47000 - 4700 - 1800 = 40500
    expect(result.grossEarnings).toBe(47000);
    expect(result.totalDeductions).toBe(6500);
    expect(result.netPayable).toBe(40500);
  });

  it('fills context incrementally for subsequent formula resolution', () => {
    // Earlier formulas contribute to context for later ones
    const result = computePayroll({
      structureComponents: [
        { code: 'BASIC', type: 'EARNING', calculationType: 'fixed', formula: null, defaultValue: 50000, sortOrder: 1 },
        { code: 'HRA', type: 'EARNING', calculationType: 'formula', formula: 'BASIC * 0.4', defaultValue: 0, sortOrder: 2 },
        { code: 'GROSS_UP', type: 'EARNING', calculationType: 'formula', formula: 'BASIC + HRA', defaultValue: 0, sortOrder: 3 },
        { code: 'CESS', type: 'DEDUCTION', calculationType: 'formula', formula: 'GROSS_UP * 0.02', defaultValue: 0, sortOrder: 4 },
      ],
      monthlyCTC: 600000,
      workingDays: 26,
      presentDays: 26,
      lopDays: 0,
    });

    // CESS = (50000 + 20000) * 0.02 = 1400
    expect(result.components.find((c) => c.code === 'CESS')!.amount).toBe(1400);
  });
});

// =========================================================================
// Integration: validateFormula then evaluateFormula consistency
// =========================================================================
describe('SalaryFormulaEvaluator — validate-then-evaluate consistency', () => {
  it('formula that passes validation also evaluates correctly', () => {
    const formula = 'BASIC * 0.4';
    const codes = ['BASIC'];
    expect(() => validateFormula(formula, codes)).not.toThrow();
    expect(evaluateFormula(formula, { BASIC: 50000 })).toBe(20000);
  });

  it('complex validated formula evaluates correctly', () => {
    const formula = '(BASIC + HRA) * 0.1';
    const codes = ['BASIC', 'HRA'];
    expect(() => validateFormula(formula, codes)).not.toThrow();
    expect(evaluateFormula(formula, { BASIC: 50000, HRA: 20000 })).toBe(7000);
  });

  it('Math.min formula validates and evaluates consistently', () => {
    const formula = 'Math.min(BASIC * 0.12, 1800)';
    const codes = ['BASIC'];
    expect(() => validateFormula(formula, codes)).not.toThrow();
    expect(evaluateFormula(formula, { BASIC: 50000 })).toBe(1800);
    expect(evaluateFormula(formula, { BASIC: 10000 })).toBe(1200);
  });
});
