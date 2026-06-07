import type { PayrollComputeInput } from '../utils/compute-payroll';

// ---------------------------------------------------------------------------
// Payroll compute input factories
// ---------------------------------------------------------------------------

export function makeComponent(overrides: Record<string, unknown> = {}) {
  return {
    code: 'BASIC',
    type: 'earning' as const,
    calculationType: 'fixed' as const,
    formula: null,
    defaultValue: 50000,
    sortOrder: 1,
    ...overrides,
  };
}

export function makeStructure(overrides: Record<string, unknown> = {}) {
  return {
    id: 'struct-1',
    companyId: 'co-1',
    name: 'Grade A',
    description: null,
    isActive: true,
    components: [],
    ...overrides,
  };
}

export function makeCycle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cycle-1',
    companyId: 'co-1',
    month: 6,
    year: 2026,
    status: 'DRAFT',
    totalGross: 0,
    totalDeductions: 0,
    totalNet: 0,
    employeeCount: 0,
    createdById: 'hr-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    cycleId: 'cycle-1',
    employeeId: 'emp-1',
    structureId: 'struct-1',
    monthlyCtc: 50000,
    workingDays: 26,
    presentDays: 26,
    lopDays: 0,
    grossEarnings: 0,
    totalDeductions: 0,
    netPayable: 0,
    status: 'COMPUTED',
    payslipKey: null,
    payslipGeneratedAt: null,
    payslipGenFailed: false,
    ...overrides,
  };
}

export function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: 'emp-1',
    companyId: 'co-1',
    workEmail: 'jane@test.com',
    status: 'ACTIVE',
    joinedAt: new Date('2020-01-01'),
    ...overrides,
  };
}

export function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    data: {
      cycleId: 'cycle-1',
      companyId: 'co-1',
      month: 6,
      year: 2024,
      triggeredByUserId: 'hr-1',
    },
    updateProgress: vi.fn(),
    log: vi.fn(),
    ...overrides,
  };
}

/**
 * Build the standard payroll structure with 4 components:
 * BASIC (fixed), HRA (formula 40% of BASIC), TDS (fixed), PF (formula capped)
 */
export function makeStandardStructure(): PayrollComputeInput['structureComponents'] {
  return [
    makeComponent({
      code: 'BASIC',
      type: 'earning',
      calculationType: 'fixed',
      defaultValue: 50000,
      sortOrder: 1,
    }),
    makeComponent({
      code: 'HRA',
      type: 'earning',
      calculationType: 'formula',
      formula: 'BASIC * 0.4',
      defaultValue: 0,
      sortOrder: 2,
    }),
    makeComponent({
      code: 'TDS',
      type: 'deduction',
      calculationType: 'fixed',
      defaultValue: 7000,
      sortOrder: 3,
    }),
    makeComponent({
      code: 'PF',
      type: 'deduction',
      calculationType: 'formula',
      formula: 'Math.min(BASIC * 0.12, 1800)',
      defaultValue: 0,
      sortOrder: 4,
    }),
  ];
}
