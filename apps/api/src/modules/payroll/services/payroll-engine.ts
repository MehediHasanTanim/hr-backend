import { Injectable, Logger } from '@nestjs/common';
import { Parser } from 'expr-eval';
import { round2dp } from '../utils/round2dp';
import { getWorkingDaysInMonth } from '../utils/working-days';

export class SkipEmployeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkipEmployeeError';
  }
}

export class FormulaEvaluationError extends Error {
  constructor(
    message: string,
    public readonly componentCode: string,
    public readonly formula: string,
  ) {
    super(message);
    this.name = 'FormulaEvaluationError';
  }
}

export interface PayrollEntryResult {
  entry: {
    cycleId: string;
    employeeId: string;
    structureId: string;
    monthlyCtc: number;
    workingDays: number;
    presentDays: number;
    lopDays: number;
    grossEarnings: number;
    totalDeductions: number;
    netPayable: number;
    status: 'COMPUTED';
  };
  components: Array<{
    componentId: string;
    componentCode: string;
    componentName: string;
    type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
    amount: number;
  }>;
}

interface ComponentContext {
  [code: string]: number;
}

@Injectable()
export class PayrollEngine {
  private readonly logger = new Logger(PayrollEngine.name);

  /**
   * Pure computation: compute payroll for a single employee for a given cycle.
   * No side effects, no DB writes.
   */
  async computeForEmployee(
    employeeId: string,
    cycleId: string,
    month: number,
    year: number,
    employeeSalary: {
      ctc: number;
      structureId: string;
      structure: {
        components: Array<{
          sortOrder: number;
          defaultValue: number;
          component: {
            id: string;
            code: string;
            name: string;
            type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
            calcMethod: 'FIXED' | 'FORMULA' | 'PERCENT_OF_BASIC';
            formula: string | null;
            defaultValue: number | null;
          };
        }>;
      };
    },
    attendanceSummary: {
      presentDays: number;
      unpaidLeaveDays: number;
    },
    hireDate: Date | null,
    holidays: Array<{ date: Date; name: string }>,
  ): Promise<PayrollEntryResult> {
    // Step 1 — monthly CTC
    const monthlyCtc = round2dp(Number(employeeSalary.ctc) / 12);

    // Step 2 — Working days and LOP
    const workingDays = this.computeWorkingDays(year, month, holidays, hireDate);

    const presentDaysRaw = attendanceSummary.presentDays;
    const unpaidLop = attendanceSummary.unpaidLeaveDays;

    // LOP = working days - present days (floor at 0), plus unpaid leave days
    let lopDays = Math.max(0, workingDays - presentDaysRaw) + unpaidLop;
    // If unpaid leave already accounted for in presentDaysRaw, adjust
    // presentDays used for pro-rating excludes unpaid LOP
    const presentDays = Math.max(0, workingDays - lopDays);

    // Step 3 — Compute component amounts
    const sortedComponents = [...employeeSalary.structure.components].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    const context: ComponentContext = {
      MONTHLY_CTC: monthlyCtc,
      WORKING_DAYS: workingDays,
      PRESENT_DAYS: presentDays,
      LOP_DAYS: lopDays,
    };

    const components: PayrollEntryResult['components'] = [];

    for (const sc of sorted) {
      const comp = sc.component;
      let amount = 0;

      switch (comp.calcMethod) {
        case 'FIXED': {
          const baseValue = sc.defaultValue || Number(comp.defaultValue) || 0;
          // Pro-rate for LOP
          amount = workingDays > 0
            ? round2dp(baseValue * (presentDays / workingDays))
            : 0;
          break;
        }
        case 'PERCENT_OF_BASIC': {
          const base = context['BASIC'] ?? 0;
          const pct = sc.defaultValue || Number(comp.defaultValue) || 0;
          // Do NOT pro-rate percentage components (BASIC already pro-rated)
          amount = round2dp(base * (pct / 100));
          break;
        }
        case 'FORMULA': {
          if (!comp.formula) {
            throw new FormulaEvaluationError(
              `Formula component ${comp.code} has no formula`,
              comp.code,
              '',
            );
          }
          try {
            const parser = new Parser();
            const expr = parser.parse(comp.formula);
            const result = expr.evaluate({ ...context });
            if (typeof result !== 'number' || !isFinite(result)) {
              throw new FormulaEvaluationError(
                `Formula for ${comp.code} did not evaluate to a finite number`,
                comp.code,
                comp.formula,
              );
            }
            amount = round2dp(Math.max(0, result));
          } catch (err) {
            if (err instanceof FormulaEvaluationError) throw err;
            const message = err instanceof Error ? err.message : 'Unknown error';
            throw new FormulaEvaluationError(
              `Formula evaluation error for ${comp.code}: ${message}`,
              comp.code,
              comp.formula,
            );
          }
          break;
        }
      }

      // Clamp at 0
      amount = Math.max(0, amount);

      components.push({
        componentId: comp.id,
        componentCode: comp.code,
        componentName: comp.name,
        type: comp.type,
        amount,
      });

      // Add to context for subsequent formulas
      context[comp.code] = amount;
    }

    // Step 4 — Aggregate totals
    let grossEarnings = 0;
    let totalDeductions = 0;

    for (const c of components) {
      if (c.type === 'EARNING') {
        grossEarnings += c.amount;
      } else if (c.type === 'DEDUCTION') {
        totalDeductions += c.amount;
      }
      // Employer contributions don't affect gross/deductions
    }

    grossEarnings = round2dp(grossEarnings);
    totalDeductions = round2dp(totalDeductions);
    const netPayable = round2dp(Math.max(0, grossEarnings - totalDeductions));

    // Step 5 — Build result
    return {
      entry: {
        cycleId,
        employeeId,
        structureId: employeeSalary.structureId,
        monthlyCtc,
        workingDays,
        presentDays,
        lopDays,
        grossEarnings,
        totalDeductions,
        netPayable,
        status: 'COMPUTED',
      },
      components,
    };
  }

  private computeWorkingDays(
    year: number,
    month: number,
    holidays: Array<{ date: Date; name: string }>,
    hireDate: Date | null,
  ): number {
    return getWorkingDaysInMonth(year, month, holidays);
  }
}
