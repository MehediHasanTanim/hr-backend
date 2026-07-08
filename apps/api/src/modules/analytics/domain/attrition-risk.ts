/**
 * Pure function: Compute attrition risk score from signal inputs.
 * No DB access, no side effects — fully property-testable.
 *
 * Signals (tunable weights):
 * - Tenure < 6 months → +30
 * - Last review rating < 3 (out of 5) → +35
 * - Absences in last 90 days > 5 → +35
 * totalScore = clamp(sum, 0, 100)
 */
export interface AttritionSignalInput {
  tenureMonths: number;
  lastReviewRating: number | null;
  absenceCountLast90d: number;
}

export interface AttritionSignalBreakdown {
  tenureMonths: number;
  tenureSignal: number;
  lastReviewRating: number | null;
  reviewSignal: number;
  absenceCountLast90d: number;
  absenceSignal: number;
  totalScore: number;
  riskBand: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

const TENURE_THRESHOLD_MONTHS = 6;
const TENURE_SIGNAL_WEIGHT = 30;
const REVIEW_THRESHOLD = 3;
const REVIEW_SIGNAL_WEIGHT = 35;
const ABSENCE_THRESHOLD = 5;
const ABSENCE_SIGNAL_WEIGHT = 35;

export function computeAttritionRisk(input: AttritionSignalInput): AttritionSignalBreakdown {
  const tenureSignal = input.tenureMonths < TENURE_THRESHOLD_MONTHS ? TENURE_SIGNAL_WEIGHT : 0;
  const reviewSignal = input.lastReviewRating !== null && input.lastReviewRating < REVIEW_THRESHOLD ? REVIEW_SIGNAL_WEIGHT : 0;
  const absenceSignal = input.absenceCountLast90d > ABSENCE_THRESHOLD ? ABSENCE_SIGNAL_WEIGHT : 0;

  const totalScore = Math.min(100, Math.max(0, tenureSignal + reviewSignal + absenceSignal));

  let riskBand: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  if (totalScore >= 75) riskBand = 'CRITICAL';
  else if (totalScore >= 50) riskBand = 'HIGH';
  else if (totalScore >= 25) riskBand = 'MEDIUM';
  else riskBand = 'LOW';

  return {
    tenureMonths: input.tenureMonths,
    tenureSignal,
    lastReviewRating: input.lastReviewRating,
    reviewSignal,
    absenceCountLast90d: input.absenceCountLast90d,
    absenceSignal,
    totalScore,
    riskBand,
  };
}
