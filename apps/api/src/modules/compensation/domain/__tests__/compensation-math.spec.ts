import { describe, it, expect } from 'vitest';
import { computeVestingSchedule, computeRecoveryInstallment, round2dp } from '../compensation-math';

describe('computeVestingSchedule', () => {
  it('sum of all vesting events equals totalUnits', () => {
    const schedule = computeVestingSchedule({
      totalUnits: 1000, cliffMonths: 12, vestingDurationMonths: 48,
      vestingFrequency: 'MONTHLY', vestingStartDate: '2025-01-01',
    });
    const sum = schedule.reduce((acc, e) => acc + e.unitsVested, 0);
    expect(sum).toBe(1000);
  });

  it('no vesting events before cliff month', () => {
    const schedule = computeVestingSchedule({
      totalUnits: 480, cliffMonths: 12, vestingDurationMonths: 48,
      vestingFrequency: 'MONTHLY', vestingStartDate: '2025-01-01',
    });
    const start = new Date('2025-01-01');
    for (const event of schedule) {
      const eventDate = new Date(event.vestDate);
      const monthsDiff = (eventDate.getFullYear() - start.getFullYear()) * 12 + (eventDate.getMonth() - start.getMonth());
      expect(monthsDiff).toBeGreaterThanOrEqual(12);
    }
  });

  it('quarterly vesting produces fewer events than monthly', () => {
    const monthly = computeVestingSchedule({
      totalUnits: 1000, cliffMonths: 12, vestingDurationMonths: 48,
      vestingFrequency: 'MONTHLY', vestingStartDate: '2025-01-01',
    });
    const quarterly = computeVestingSchedule({
      totalUnits: 1000, cliffMonths: 12, vestingDurationMonths: 48,
      vestingFrequency: 'QUARTERLY', vestingStartDate: '2025-01-01',
    });
    expect(quarterly.length).toBeLessThan(monthly.length);
  });

  it('zero cliff vests from first period', () => {
    const schedule = computeVestingSchedule({
      totalUnits: 120, cliffMonths: 0, vestingDurationMonths: 12,
      vestingFrequency: 'MONTHLY', vestingStartDate: '2025-01-01',
    });
    expect(schedule.length).toBeGreaterThan(0);
    const firstDate = new Date(schedule[0].vestDate);
    const start = new Date('2025-01-01');
    expect(firstDate > start).toBe(true);
  });

  it('handles large unit numbers without floating point drift', () => {
    const schedule = computeVestingSchedule({
      totalUnits: 99999, cliffMonths: 12, vestingDurationMonths: 48,
      vestingFrequency: 'QUARTERLY', vestingStartDate: '2025-01-01',
    });
    const sum = schedule.reduce((acc, e) => acc + e.unitsVested, 0);
    expect(sum).toBe(99999);
  });
});

describe('computeRecoveryInstallment', () => {
  it('recovers full installment when balance exceeds amount', () => {
    const result = computeRecoveryInstallment({ outstandingBalance: '1000.00', installmentAmount: '200.00' });
    expect(result.amountToRecover).toBe('200.00');
    expect(result.remainingAfter).toBe('800.00');
  });

  it('recovers exactly outstanding when balance is less than installment', () => {
    const result = computeRecoveryInstallment({ outstandingBalance: '50.00', installmentAmount: '200.00' });
    expect(result.amountToRecover).toBe('50.00');
    expect(result.remainingAfter).toBe('0.00');
  });

  it('final installment closes balance exactly to zero', () => {
    const result = computeRecoveryInstallment({ outstandingBalance: '200.00', installmentAmount: '200.00' });
    expect(result.amountToRecover).toBe('200.00');
    expect(result.remainingAfter).toBe('0.00');
  });

  it('never returns negative remaining balance', () => {
    const result = computeRecoveryInstallment({ outstandingBalance: '10.00', installmentAmount: '1000.00' });
    expect(result.amountToRecover).toBe('10.00');
    expect(result.remainingAfter).toBe('0.00');
    expect(parseFloat(result.remainingAfter)).toBeGreaterThanOrEqual(0);
  });
});

describe('round2dp', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2dp(10.456)).toBe('10.46');
    expect(round2dp(10.454)).toBe('10.45');
  });

  it('handles whole numbers', () => {
    expect(round2dp(100)).toBe('100.00');
  });

  it('handles string input', () => {
    expect(round2dp('99.999')).toBe('100.00');
  });
});
