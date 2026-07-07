/**
 * Pure function: Compute vesting schedule for an equity grant.
 * No DB access, no Date.now(), no side effects — fully property-testable.
 *
 * Rules:
 * - No vesting before cliffMonths. At cliff month, vest cumulative = cliff catch-up.
 * - After cliff, vest evenly per period (monthly or quarterly).
 * - Last period absorbs rounding remainder → sum(unitsVested) === totalUnits.
 */
export function computeVestingSchedule(grant: {
  totalUnits: number;
  cliffMonths: number;
  vestingDurationMonths: number;
  vestingFrequency: 'MONTHLY' | 'QUARTERLY';
  vestingStartDate: string; // ISO date
}): Array<{ vestDate: string; unitsVested: number }> {
  const { totalUnits, cliffMonths, vestingDurationMonths, vestingFrequency } = grant;
  const periodMonths = vestingFrequency === 'MONTHLY' ? 1 : 3;
  const totalPeriods = Math.ceil(vestingDurationMonths / periodMonths);
  const startDate = new Date(grant.vestingStartDate);

  // Fair share per period (integer floor), remainder goes to last period
  const perPeriod = Math.floor(totalUnits / totalPeriods);
  let remainder = totalUnits - perPeriod * totalPeriods;
  const events: Array<{ vestDate: string; unitsVested: number }> = [];

  let cliffEventAdded = false;
  let cumulativeBeforeCliff = 0;

  for (let p = 1; p <= totalPeriods; p++) {
    const monthsFromStart = p * periodMonths;
    const vestDate = new Date(startDate);
    vestDate.setMonth(vestDate.getMonth() + monthsFromStart);

    if (monthsFromStart < cliffMonths) {
      // Before cliff: accumulate but don't vest
      cumulativeBeforeCliff += perPeriod + (p === totalPeriods ? remainder : 0);
      continue;
    }

    if (!cliffEventAdded && monthsFromStart >= cliffMonths) {
      // Cliff catch-up: vest everything accumulated up to now
      const cliffRemainder = p === totalPeriods ? remainder : 0;
      const cliffUnits = cumulativeBeforeCliff + perPeriod + cliffRemainder;
      events.push({ vestDate: vestDate.toISOString().slice(0, 10), unitsVested: cliffUnits });
      cliffEventAdded = true;
      if (p === totalPeriods) remainder = 0;
      cumulativeBeforeCliff = 0;
      continue;
    }

    // Post-cliff: regular vesting
    const units = perPeriod + (p === totalPeriods ? remainder : 0);
    if (units > 0) {
      events.push({ vestDate: vestDate.toISOString().slice(0, 10), unitsVested: units });
    }
    if (p === totalPeriods) remainder = 0;
  }

  return events;
}

/** round2dp: Round a decimal value to 2 decimal places for monetary amounts */
export function round2dp(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return (Math.round(num * 100) / 100).toFixed(2);
}

/**
 * Pure function: Compute the recovery installment.
 * amountToRecover = min(installmentAmount, outstandingBalance)
 * Never over-recovers.
 */
export function computeRecoveryInstallment(advance: {
  outstandingBalance: string;
  installmentAmount: string;
}): { amountToRecover: string; remainingAfter: string } {
  const balance = parseFloat(advance.outstandingBalance);
  const installment = parseFloat(advance.installmentAmount);
  const toRecover = Math.min(installment, balance);
  return {
    amountToRecover: round2dp(toRecover),
    remainingAfter: round2dp(balance - toRecover),
  };
}
