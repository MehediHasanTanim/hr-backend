import type { PayrollComputeInput, PayrollComputeResult } from '../utils/compute-payroll';

/**
 * Strip non-deterministic fields from a payroll result for snapshot stability.
 * Removes IDs, timestamps, and any random UUIDs so snapshots don't break on
 * every test run.
 */
export function normalizeSnapshot(result: PayrollComputeResult): PayrollComputeResult {
  return {
    grossEarnings: result.grossEarnings,
    totalDeductions: result.totalDeductions,
    netPayable: result.netPayable,
    components: result.components.map((c) => ({
      code: c.code,
      type: c.type,
      amount: c.amount,
    })),
  };
}

/**
 * Build a PayrollComputeInput from a simple descriptor.
 * Useful for snapshot tests where you want named scenarios.
 */
export interface PayrollScenario {
  name: string;
  description: string;
  structureComponents: PayrollComputeInput['structureComponents'];
  monthlyCTC: number;
  workingDays: number;
  presentDays: number;
  lopDays: number;
}

/**
 * Run a payroll scenario and return a normalized result + the input for context.
 */
export function runScenario(input: PayrollComputeInput): {
  input: PayrollComputeInput;
  result: PayrollComputeResult;
  normalized: PayrollComputeResult;
} {
  // Lazy import to avoid circular deps
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { computePayroll } = require('../utils/compute-payroll');
  const result = computePayroll(input) as PayrollComputeResult;
  return { input, result, normalized: normalizeSnapshot(result) };
}

/**
 * Assert that totalDeductions ≤ grossEarnings (i.e. net is never negative).
 */
export function assertSolvency(result: PayrollComputeResult): void {
  expect(result.totalDeductions).toBeLessThanOrEqual(result.grossEarnings + 0.01);
  expect(result.netPayable).toBeGreaterThanOrEqual(0);
}

/**
 * Compute the sum of all earning components.
 */
export function sumEarnings(result: PayrollComputeResult): number {
  return result.components
    .filter((c) => c.type === 'earning')
    .reduce((s, c) => s + c.amount, 0);
}

/**
 * Compute the sum of all deduction components.
 */
export function sumDeductions(result: PayrollComputeResult): number {
  return result.components
    .filter((c) => c.type === 'deduction')
    .reduce((s, c) => s + c.amount, 0);
}
