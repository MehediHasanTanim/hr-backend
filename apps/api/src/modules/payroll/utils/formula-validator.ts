import { BadRequestError } from '@hr/shared';
import { Parser } from 'expr-eval';

const DISALLOWED_KEYWORDS = [
  'eval', 'require', 'import', 'process', 'global', 'window',
  'document', '__proto__', 'prototype', 'constructor',
];

const ALLOWED_MATH_METHODS = new Set([
  'Math.min', 'Math.max', 'Math.floor', 'Math.round', 'Math.ceil', 'Math.abs',
  'Math', 'min', 'max', 'floor', 'round', 'ceil', 'abs',
  'PI', 'E', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT1_2', 'SQRT2',
]);

/**
 * Validate a formula expression string.
 *
 * @param formula  - The raw formula string (e.g. "BASIC * 0.4")
 * @param knownCodes - The set of component codes that are valid variables
 * @throws BadRequestError if the formula is invalid
 */
export function validateFormula(formula: string, knownCodes: string[]): void {
  if (!formula || formula.trim().length === 0) {
    throw new BadRequestError('Formula is required for calculationType=formula');
  }

  // 1. Check for disallowed keywords
  const lower = formula.toLowerCase();
  for (const kw of DISALLOWED_KEYWORDS) {
    if (lower.includes(kw)) {
      throw new BadRequestError(`Formula contains disallowed keyword: "${kw}"`);
    }
  }

  // 2. Tokenise to find unknown identifiers
  const codeSet = new Set(knownCodes.map((c) => c.toUpperCase()));
  const tokenPattern = /[A-Za-z_]\w*/g;
  const tokens = formula.match(tokenPattern) ?? [];

  for (const token of tokens) {
    const upper = token.toUpperCase();
    // Skip numeric, math methods, known codes, and literals
    if (
      codeSet.has(upper) ||
      ALLOWED_MATH_METHODS.has(token) ||
      token.startsWith('Math.')
    ) {
      continue;
    }
    // Skip standalone numbers and common operators
    if (/^\d+(\.\d+)?$/.test(token)) continue;


    throw new BadRequestError(
      `Formula contains unknown token: "${token}". Valid variables: ${knownCodes.join(', ')}`,
    );
  }

  // 3. Try evaluating with mocked values
  const context: Record<string, any> = { Math };
  for (const code of knownCodes) {
    context[code] = 1000;
  }
  context.MONTHLY_CTC = 50000;
  context.WORKING_DAYS = 22;
  context.PRESENT_DAYS = 20;
  context.LOP_DAYS = 2;

  // Pre-process: replace Math.xxx() calls with xxx() for expr-eval compatibility
  const processedFormula = formula.replace(/Math\.(\w+)/g, '$1');

  try {
    const parser = new Parser();
    const expr = parser.parse(processedFormula);
    const evalContext: Record<string, any> = {
      Math,
      min: Math.min, max: Math.max, floor: Math.floor,
      round: Math.round, ceil: Math.ceil, abs: Math.abs,
    };
    for (const code of knownCodes) {
      evalContext[code] = 1000;
    }
    evalContext.MONTHLY_CTC = 50000;
    evalContext.WORKING_DAYS = 22;
    evalContext.PRESENT_DAYS = 20;
    evalContext.LOP_DAYS = 2;

    const result = expr.evaluate(evalContext);
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new BadRequestError('Formula does not evaluate to a finite number');
    }
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new BadRequestError(`Formula syntax error: ${message}`);
  }
}

/**
 * Runtime evaluation of a formula with actual context values.
 * Used at payroll computation time (not configuration time).
 */
export function evaluateFormula(formula: string, context: Record<string, number>): number {
  const processedFormula = formula.replace(/Math\.(\w+)/g, '$1');
  try {
    const parser = new Parser({
      operators: { assignment: false },
    });
    const evalContext: Record<string, any> = {
      ...context,
      Math,
      min: Math.min, max: Math.max, floor: Math.floor,
      round: Math.round, ceil: Math.ceil, abs: Math.abs,
    };
    const expr = parser.parse(processedFormula);
    const result = expr.evaluate(evalContext);
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new FormulaEvaluationError(
        `Formula did not evaluate to a finite number: ${result}`,
        '',
        formula,
      );
    }
    return round2dp(Math.max(0, result));
  } catch (err) {
    if (err instanceof FormulaEvaluationError) throw err;
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new FormulaEvaluationError(
      `Formula evaluation error: ${message}`,
      '',
      formula,
    );
  }
}

import { FormulaEvaluationError } from '../services/payroll-engine';
import { round2dp } from './round2dp';
