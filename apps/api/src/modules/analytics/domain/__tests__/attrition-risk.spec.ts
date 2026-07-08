import { describe, it, expect } from 'vitest';
import { computeAttritionRisk } from '../attrition-risk';

describe('computeAttritionRisk', () => {
  it('returns LOW for employee with no risk signals', () => {
    const result = computeAttritionRisk({ tenureMonths: 24, lastReviewRating: 4, absenceCountLast90d: 1 });
    expect(result.riskBand).toBe('LOW');
    expect(result.totalScore).toBe(0);
  });

  it('returns CRITICAL when all three signals trigger', () => {
    const result = computeAttritionRisk({ tenureMonths: 3, lastReviewRating: 2, absenceCountLast90d: 10 });
    expect(result.riskBand).toBe('CRITICAL');
    expect(result.totalScore).toBe(100);
  });

  it('tenure < 6 months adds 30 points', () => {
    const result = computeAttritionRisk({ tenureMonths: 5, lastReviewRating: 5, absenceCountLast90d: 0 });
    expect(result.tenureSignal).toBe(30);
    expect(result.totalScore).toBe(30);
    expect(result.riskBand).toBe('MEDIUM');
  });

  it('tenure >= 6 months contributes nothing', () => {
    const result = computeAttritionRisk({ tenureMonths: 6, lastReviewRating: 1, absenceCountLast90d: 0 });
    expect(result.tenureSignal).toBe(0);
    expect(result.reviewSignal).toBe(35);
  });

  it('review rating < 3 adds 35 points', () => {
    const result = computeAttritionRisk({ tenureMonths: 24, lastReviewRating: 2, absenceCountLast90d: 0 });
    expect(result.reviewSignal).toBe(35);
    expect(result.totalScore).toBe(35);
    expect(result.riskBand).toBe('MEDIUM');
  });

  it('review rating >= 3 contributes nothing', () => {
    const result = computeAttritionRisk({ tenureMonths: 6, lastReviewRating: 3, absenceCountLast90d: 0 });
    expect(result.reviewSignal).toBe(0);
  });

  it('null review rating contributes nothing', () => {
    const result = computeAttritionRisk({ tenureMonths: 3, lastReviewRating: null, absenceCountLast90d: 10 });
    expect(result.reviewSignal).toBe(0);
    expect(result.totalScore).toBe(65); // 30 + 0 + 35
  });

  it('absence count > 5 adds 35 points', () => {
    const result = computeAttritionRisk({ tenureMonths: 24, lastReviewRating: 4, absenceCountLast90d: 6 });
    expect(result.absenceSignal).toBe(35);
    expect(result.totalScore).toBe(35);
  });

  it('absence count <= 5 contributes nothing', () => {
    const result = computeAttritionRisk({ tenureMonths: 3, lastReviewRating: 5, absenceCountLast90d: 5 });
    expect(result.absenceSignal).toBe(0);
    expect(result.totalScore).toBe(30);
  });

  it('clamps score to 100 maximum', () => {
    // All signals: 30 + 35 + 35 = 100, then clamped
    const result = computeAttritionRisk({ tenureMonths: 1, lastReviewRating: 1, absenceCountLast90d: 20 });
    expect(result.totalScore).toBe(100);
  });

  it('clamps score to 0 minimum', () => {
    const result = computeAttritionRisk({ tenureMonths: 100, lastReviewRating: 5, absenceCountLast90d: 0 });
    expect(result.totalScore).toBe(0);
  });

  it('band thresholds: LOW 0-24', () => {
    const low = computeAttritionRisk({ tenureMonths: 3, lastReviewRating: 5, absenceCountLast90d: 0 }); // 30 → MEDIUM
    expect(low.riskBand).toBe('MEDIUM');
    const zero = computeAttritionRisk({ tenureMonths: 100, lastReviewRating: 5, absenceCountLast90d: 0 });
    expect(zero.riskBand).toBe('LOW');
  });

  it('band thresholds: HIGH 50-74', () => {
    const high = computeAttritionRisk({ tenureMonths: 3, lastReviewRating: 2, absenceCountLast90d: 0 }); // 65
    expect(high.riskBand).toBe('HIGH');
  });

  it('score is monotonic — worse inputs never decrease score', () => {
    const base = computeAttritionRisk({ tenureMonths: 24, lastReviewRating: 4, absenceCountLast90d: 3 });
    const worse = computeAttritionRisk({ tenureMonths: 2, lastReviewRating: 1, absenceCountLast90d: 10 });
    expect(worse.totalScore).toBeGreaterThanOrEqual(base.totalScore);
  });

  it('returns correct signal breakdown structure', () => {
    const result = computeAttritionRisk({ tenureMonths: 48, lastReviewRating: 2, absenceCountLast90d: 8 });
    expect(result).toHaveProperty('tenureMonths', 48);
    expect(result).toHaveProperty('tenureSignal', 0);
    expect(result).toHaveProperty('reviewSignal', 35);
    expect(result).toHaveProperty('absenceSignal', 35);
    expect(result).toHaveProperty('totalScore', 70);
    expect(result).toHaveProperty('riskBand', 'HIGH');
  });
});
