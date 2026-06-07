import { Parser } from 'expr-eval';
import { round2dp } from './round2dp';
import { FormulaEvaluationError } from '../services/payroll-engine';

export interface PayrollComputeInput {
  structureComponents: Array<{
    code: string;
    type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
    calculationType: 'fixed' | 'formula' | 'percentage_of_base';
    formula: string | null;
    defaultValue: number;
    sortOrder: number;
  }>;
  monthlyCTC: number;
  workingDays: number;
  presentDays: number;
  lopDays: number;
}

export interface PayrollComputeResult {
  grossEarnings: number;
  totalDeductions: number;
  netPayable: number;
  components: Array<{ code: string; type: string; amount: number }>;
}

interface ComponentContext {
  [code: string]: number;
}

/**
 * Pure function: computes payroll amounts from input data.
 * No side effects, no DB reads. Deterministic.
 */
export function computePayroll(input: PayrollComputeInput): PayrollComputeResult {
  const { structureComponents, monthlyCTC, workingDays, presentDays, lopDays } = input;

  const sorted = [...structureComponents].sort((a, b) => a.sortOrder - b.sortOrder);

  const context: ComponentContext = {
    MONTHLY_CTC: monthlyCTC,
    WORKING_DAYS: workingDays,
    PRESENT_DAYS: presentDays,
    LOP_DAYS: lopDays,
  };

  const components: PayrollComputeResult['components'] = [];

  for (const sc of sorted) {
    let amount = 0;
    const calcType = sc.calculationType;

    switch (calcType) {
      case 'fixed': {
        const baseValue = sc.defaultValue || 0;
        amount = workingDays > 0
          ? round2dp(baseValue * (presentDays / workingDays))
          : 0;
        break;
      }
      case 'percentage_of_base': {
        const base = context['BASIC'] ?? 0;
        const pct = sc.defaultValue || 0;
        amount = round2dp(base * (pct / 100));
        break;
      }
      case 'formula': {
        if (!sc.formula) {
          throw new FormulaEvaluationError(
            `Formula component ${sc.code} has no formula`,
            sc.code,
            '',
          );
        }
        try {
          const processedFormula = sc.formula.replace(/Math\.(\w+)/g, '$1');
          const parser = new Parser();
          const expr = parser.parse(processedFormula);
          const evalCtx = { ...context, Math, min: Math.min, max: Math.max, floor: Math.floor, round: Math.round, ceil: Math.ceil, abs: Math.abs };
          const result = expr.evaluate(evalCtx);
          if (typeof result !== 'number' || !isFinite(result)) {
            throw new FormulaEvaluationError(
              `Formula for ${sc.code} did not evaluate to a finite number`,
              sc.code,
              sc.formula,
            );
          }
          amount = round2dp(Math.max(0, result));
        } catch (err) {
          if (err instanceof FormulaEvaluationError) throw err;
          const message = err instanceof Error ? err.message : 'Unknown error';
          throw new FormulaEvaluationError(
            `Formula evaluation error for ${sc.code}: ${message}`,
            sc.code,
            sc.formula ?? '',
          );
        }
        break;
      }
    }

    amount = Math.max(0, amount);

    const compType = sc.type.toUpperCase();
    components.push({
      code: sc.code,
      type: compType === 'EARNING' ? 'earning' : compType === 'DEDUCTION' ? 'deduction' : 'employer_contribution',
      amount,
    });

    context[sc.code] = amount;
  }

  let grossEarnings = 0;
  let totalDeductions = 0;

  for (const c of components) {
    if (c.type === 'earning') {
      grossEarnings += c.amount;
    } else if (c.type === 'deduction') {
      totalDeductions += c.amount;
    }
  }

  grossEarnings = round2dp(grossEarnings);
  totalDeductions = round2dp(totalDeductions);
  const netPayable = round2dp(Math.max(0, grossEarnings - totalDeductions));

  return { grossEarnings, totalDeductions, netPayable, components };
}

/**
 * Detect circular dependencies in a set of formula components.
 * A component A has a circular reference if there is a chain
 * A → B → ... → A through formula variable references.
 */
export function detectCircularDependency(
  components: Array<{ code: string; formula: string | null }>,
): void {
  const formulaMap = new Map<string, string | null>(
    components.map((c) => [c.code, c.formula]),
  );
  const tokenPattern = /[A-Za-z_]\w*/g;

  function getDependencies(code: string): string[] {
    const formula = formulaMap.get(code);
    if (!formula) return [];
    const tokens = formula.match(tokenPattern) ?? [];
    const knownCodes = new Set(formulaMap.keys());
    return [...new Set(tokens.filter((t) => knownCodes.has(t) && t !== code))];
  }

  function hasCycle(node: string, visited: Set<string>, stack: Set<string>): boolean {
    visited.add(node);
    stack.add(node);

    for (const dep of getDependencies(node)) {
      if (!visited.has(dep)) {
        if (hasCycle(dep, visited, stack)) return true;
      } else if (stack.has(dep)) {
        return true;
      }
    }

    stack.delete(node);
    return false;
  }

  for (const c of components) {
    const visited = new Set<string>();
    const stack = new Set<string>();
    if (hasCycle(c.code, visited, stack)) {
      throw new Error(`Circular dependency detected involving component "${c.code}"`);
    }
  }
}
