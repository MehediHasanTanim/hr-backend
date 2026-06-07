import { describe, it, expect, afterEach } from 'vitest';
import { computePayroll, type PayrollComputeInput } from '../utils/compute-payroll';
import { makeStandardStructure } from './factories';
import { round2dp } from '../utils/round2dp';

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PayrollEngine — snapshot tests', () => {
  describe('standard structure, full month (26 working days, 0 LOP)', () => {
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

    it('HRA component is 20000.00 (50000 * 0.4)', () => {
      const hra = result.components.find((c) => c.code === 'HRA');
      expect(hra!.amount).toBe(20000.00);
    });

    it('PF component is 1800.00 (min(50000 * 0.12, 1800) = min(6000, 1800))', () => {
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

    it('matches full component breakdown snapshot', () => {
      expect(result).toMatchSnapshot();
    });
  });

  describe('standard structure with 3 LOP days (26 working days, 23 present)', () => {
    const LOP_INPUT: PayrollComputeInput = {
      structureComponents: makeStandardStructure(),
      monthlyCTC: round2dp(600000 / 12),
      workingDays: 26,
      presentDays: 23,
      lopDays: 3,
    };

    const result = computePayroll(LOP_INPUT);

    it('BASIC is pro-rated correctly for 3 LOP days', () => {
      const basic = result.components.find((c) => c.code === 'BASIC');
      // 50000 * (23/26) = 44230.77
      expect(basic!.amount).toBeCloseTo(44230.77, 2);
    });

    it('HRA reflects pro-rated BASIC', () => {
      const hra = result.components.find((c) => c.code === 'HRA');
      // 44230.77 * 0.4 = 17692.31
      expect(hra!.amount).toBeCloseTo(17692.31, 2);
    });

    it('PF cap still applies on pro-rated BASIC', () => {
      const pf = result.components.find((c) => c.code === 'PF');
      // min(44230.77 * 0.12, 1800) = min(5307.69, 1800) = 1800
      expect(pf!.amount).toBe(1800.00);
    });

    it('TDS is pro-rated for 3 LOP days', () => {
      const tds = result.components.find((c) => c.code === 'TDS');
      // 7000 * (23/26) = 6192.31
      expect(tds!.amount).toBeCloseTo(6192.31, 2);
    });

    it('netPayable matches snapshot with 3 LOP days', () => {
      expect(result).toMatchSnapshot();
    });
  });
});
