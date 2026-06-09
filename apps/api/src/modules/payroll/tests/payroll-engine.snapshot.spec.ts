import { describe, it, expect, afterEach } from 'vitest';
import { computePayroll, type PayrollComputeInput } from '../utils/compute-payroll';
import { makeStandardStructure } from './factories';
import { round2dp } from '../utils/round2dp';
import { normalizeSnapshot, type PayrollScenario } from './test-utils';

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Snapshot scenarios
// ---------------------------------------------------------------------------
const SCENARIOS: PayrollScenario[] = [
  {
    name: 'standard-full-month',
    description: 'Standard structure, full attendance (26 of 26 working days, 0 LOP)',
    structureComponents: makeStandardStructure(),
    monthlyCTC: round2dp(600000 / 12),
    workingDays: 26,
    presentDays: 26,
    lopDays: 0,
  },
  {
    name: 'standard-3-lop',
    description: 'Standard structure with 3 LOP days (26 days, 23 present)',
    structureComponents: makeStandardStructure(),
    monthlyCTC: round2dp(600000 / 12),
    workingDays: 26,
    presentDays: 23,
    lopDays: 3,
  },
  {
    name: 'standard-10-lop',
    description: 'Standard structure with 10 LOP days (26 days, 16 present)',
    structureComponents: makeStandardStructure(),
    monthlyCTC: round2dp(600000 / 12),
    workingDays: 26,
    presentDays: 16,
    lopDays: 10,
  },
  {
    name: 'standard-full-lop',
    description: 'Standard structure, full-month absence (0 of 26 days)',
    structureComponents: makeStandardStructure(),
    monthlyCTC: round2dp(600000 / 12),
    workingDays: 26,
    presentDays: 0,
    lopDays: 26,
  },
  {
    name: 'higher-ctc',
    description: 'Higher CTC (1.2M/year) with full attendance',
    structureComponents: makeStandardStructure(),
    monthlyCTC: round2dp(1200000 / 12),
    workingDays: 26,
    presentDays: 26,
    lopDays: 0,
  },
  {
    name: '21-working-days',
    description: 'Standard CTC, 21 working days, full attendance',
    structureComponents: makeStandardStructure(),
    monthlyCTC: round2dp(600000 / 12),
    workingDays: 21,
    presentDays: 21,
    lopDays: 0,
  },
  {
    name: '21-working-days-5-lop',
    description: 'Standard CTC, 21 working days, 5 LOP (16 present)',
    structureComponents: makeStandardStructure(),
    monthlyCTC: round2dp(600000 / 12),
    workingDays: 21,
    presentDays: 16,
    lopDays: 5,
  },
  {
    name: 'formula-chain',
    description: 'Formula chain: BASIC → HRA → SPECIAL cascade',
    structureComponents: [
      { code: 'BASIC', type: 'EARNING', calculationType: 'fixed', formula: null, defaultValue: 50000, sortOrder: 1 },
      { code: 'HRA', type: 'EARNING', calculationType: 'formula', formula: 'BASIC * 0.4', defaultValue: 0, sortOrder: 2 },
      { code: 'SPECIAL', type: 'EARNING', calculationType: 'formula', formula: 'BASIC + HRA', defaultValue: 0, sortOrder: 3 },
      { code: 'PF', type: 'DEDUCTION', calculationType: 'formula', formula: 'Math.min(BASIC * 0.12, 1800)', defaultValue: 0, sortOrder: 4 },
      { code: 'TDS', type: 'DEDUCTION', calculationType: 'fixed', formula: null, defaultValue: 7000, sortOrder: 5 },
    ],
    monthlyCTC: round2dp(600000 / 12),
    workingDays: 26,
    presentDays: 26,
    lopDays: 0,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PayrollEngine — snapshot tests', () => {
  for (const scenario of SCENARIOS) {
    describe(scenario.name, () => {
      const result = computePayroll(scenario as PayrollComputeInput);
      const normalized = normalizeSnapshot(result);

      it('grossEarnings is correctly computed', () => {
        expect(result.grossEarnings).toBeGreaterThanOrEqual(0);
      });

      it('totalDeductions is correctly computed', () => {
        expect(result.totalDeductions).toBeGreaterThanOrEqual(0);
      });

      it('netPayable is never negative', () => {
        expect(result.netPayable).toBeGreaterThanOrEqual(0);
      });

      it('netPayable = max(0, grossEarnings - totalDeductions)', () => {
        const expected = Math.max(0, round2dp(result.grossEarnings - result.totalDeductions));
        expect(result.netPayable).toBe(expected);
      });

      it('component amounts are all >= 0', () => {
        expect(result.components.every((c) => c.amount >= 0)).toBe(true);
      });

      it('matches normalized snapshot', () => {
        expect(normalized).toMatchSnapshot(scenario.name);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Individual detailed assertions for the standard full-month scenario
// ---------------------------------------------------------------------------
describe('PayrollEngine — detailed snapshot assertions (standard-full-month)', () => {
  const BASE_INPUT: PayrollComputeInput = {
    structureComponents: makeStandardStructure(),
    monthlyCTC: round2dp(600000 / 12), // 50000
    workingDays: 26,
    presentDays: 26,
    lopDays: 0,
  };

  const result = computePayroll(BASE_INPUT);

  it('BASIC component is 50000.00', () => {
    const basic = result.components.find((c) => c.code === 'BASIC');
    expect(basic!.amount).toBe(50000.00);
  });

  it('HRA component is 20000.00 (BASIC * 0.4)', () => {
    const hra = result.components.find((c) => c.code === 'HRA');
    expect(hra!.amount).toBe(20000.00);
  });

  it('PF component is 1800.00 (min(BASIC * 0.12, 1800) = min(6000, 1800))', () => {
    const pf = result.components.find((c) => c.code === 'PF');
    expect(pf!.amount).toBe(1800.00);
  });

  it('TDS component is 7000.00', () => {
    const tds = result.components.find((c) => c.code === 'TDS');
    expect(tds!.amount).toBe(7000.00);
  });

  it('grossEarnings is 70000.00 (BASIC 50k + HRA 20k)', () => {
    expect(result.grossEarnings).toBe(70000.00);
  });

  it('totalDeductions is 8800.00 (TDS 7k + PF 1.8k)', () => {
    expect(result.totalDeductions).toBe(8800.00);
  });

  it('netPayable is 61200.00 (70000 - 8800)', () => {
    expect(result.netPayable).toBe(61200.00);
  });
});

describe('PayrollEngine — detailed LOP proration assertions', () => {
  const LOP_INPUT: PayrollComputeInput = {
    structureComponents: makeStandardStructure(),
    monthlyCTC: round2dp(600000 / 12),
    workingDays: 26,
    presentDays: 23,
    lopDays: 3,
  };

  const result = computePayroll(LOP_INPUT);

  it('BASIC is pro-rated correctly for 3 LOP days: 50000 * (23/26) = 44230.77', () => {
    const basic = result.components.find((c) => c.code === 'BASIC');
    expect(basic!.amount).toBeCloseTo(44230.77, 2);
  });

  it('HRA reflects pro-rated BASIC: 44230.77 * 0.4 = 17692.31', () => {
    const hra = result.components.find((c) => c.code === 'HRA');
    expect(hra!.amount).toBeCloseTo(17692.31, 2);
  });

  it('PF cap still applies on pro-rated BASIC: min(44230.77 * 0.12, 1800) = 1800', () => {
    const pf = result.components.find((c) => c.code === 'PF');
    expect(pf!.amount).toBe(1800.00);
  });

  it('TDS is pro-rated for 3 LOP days: 7000 * (23/26) = 6192.31', () => {
    const tds = result.components.find((c) => c.code === 'TDS');
    expect(tds!.amount).toBeCloseTo(6192.31, 2);
  });

  it('netPayable = pro-rated earnings - pro-rated deductions', () => {
    const expectedNet = Math.max(0, round2dp(result.grossEarnings - result.totalDeductions));
    expect(result.netPayable).toBe(expectedNet);
  });
});

describe('PayrollEngine — formula chain snapshot', () => {
  it('cascade: BASIC=50000 → HRA=20000 → SPECIAL=70000 → PF=1800 → TDS=7000', () => {
    const result = computePayroll({
      structureComponents: [
        { code: 'BASIC', type: 'EARNING', calculationType: 'fixed', formula: null, defaultValue: 50000, sortOrder: 1 },
        { code: 'HRA', type: 'EARNING', calculationType: 'formula', formula: 'BASIC * 0.4', defaultValue: 0, sortOrder: 2 },
        { code: 'SPECIAL', type: 'EARNING', calculationType: 'formula', formula: 'BASIC + HRA', defaultValue: 0, sortOrder: 3 },
        { code: 'PF', type: 'DEDUCTION', calculationType: 'formula', formula: 'Math.min(BASIC * 0.12, 1800)', defaultValue: 0, sortOrder: 4 },
        { code: 'TDS', type: 'DEDUCTION', calculationType: 'fixed', formula: null, defaultValue: 7000, sortOrder: 5 },
      ],
      monthlyCTC: round2dp(600000 / 12),
      workingDays: 26,
      presentDays: 26,
      lopDays: 0,
    });

    expect(result.components.find((c) => c.code === 'BASIC')!.amount).toBe(50000);
    expect(result.components.find((c) => c.code === 'HRA')!.amount).toBe(20000);
    expect(result.components.find((c) => c.code === 'SPECIAL')!.amount).toBe(70000);
    expect(result.components.find((c) => c.code === 'PF')!.amount).toBe(1800);
    expect(result.components.find((c) => c.code === 'TDS')!.amount).toBe(7000);
    expect(result.grossEarnings).toBe(140000);
    expect(result.totalDeductions).toBe(8800);
    expect(result.netPayable).toBe(131200);
  });
});
