import type { BenefitPlanType, BenefitPlanStatus, EnrollmentWindowStatus, BenefitEnrollmentStatus, DependentRelationship, DependentVerificationStatus, CompensationCycleStatus, AllocationStatus, EquityInstrumentType, VestingFrequency, EquityGrantStatus, VestingEventStatus, SurveyStatus, SurveyQuestionType, SurveyAssignmentStatus, TaxDeclarationStatus, ReimbursementStatus, SalaryAdvanceStatus } from '@prisma/client';

type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };

export function makeBenefitPlan(overrides: DeepPartial<{
  id: string; companyId: string; name: string; type: BenefitPlanType; status: BenefitPlanStatus;
  employerContribution: string; employeeContribution: string; providerName: string;
}> = {}) {
  return { id: 'bp-001', companyId: 'comp-1', name: 'Health Plus', type: 'HEALTH' as BenefitPlanType, status: 'ACTIVE' as BenefitPlanStatus, employerContribution: '500.00', employeeContribution: '200.00', providerName: 'Aetna', ...overrides };
}

export function makeCompensationCycle(overrides: DeepPartial<{
  id: string; companyId: string; name: string; status: CompensationCycleStatus;
  totalBudget: string; allocatedTotal: string; allocations: any[];
}> = {}) {
  return { id: 'cc-001', companyId: 'comp-1', name: 'FY2026 Bonus', status: 'PLANNING' as CompensationCycleStatus, totalBudget: 100000, allocatedTotal: 0, allocations: [], ...overrides };
}

export function makeAllocation(overrides: DeepPartial<{
  id: string; cycleId: string; employeeId: string; proposedBy: string;
  proposedAmount: string; approvedAmount: string | null; status: AllocationStatus;
}> = {}) {
  return { id: 'a-001', cycleId: 'cc-001', employeeId: 'emp-1', proposedBy: 'mgr-1', proposedAmount: 5000, approvedAmount: null, status: 'PROPOSED' as AllocationStatus, ...overrides };
}

export function makeEquityGrant(overrides: DeepPartial<{
  id: string; employeeId: string; instrumentType: EquityInstrumentType;
  totalUnits: number; vestedUnits: number; strikePrice: string | null;
  grantDate: Date; vestingStartDate: Date; cliffMonths: number;
  vestingDurationMonths: number; vestingFrequency: VestingFrequency;
  status: EquityGrantStatus; vestingEvents: any[];
}> = {}) {
  return { id: 'eg-001', employeeId: 'emp-1', instrumentType: 'ISO' as EquityInstrumentType, totalUnits: 1000, vestedUnits: 0, strikePrice: '10.50', grantDate: new Date('2025-01-01'), vestingStartDate: new Date('2025-01-01'), cliffMonths: 12, vestingDurationMonths: 48, vestingFrequency: 'MONTHLY' as VestingFrequency, status: 'ACTIVE' as EquityGrantStatus, vestingEvents: [], ...overrides };
}

export function makeVestingEvent(overrides: DeepPartial<{
  id: string; equityGrantId: string; vestDate: Date; unitsVested: number; status: VestingEventStatus;
}> = {}) {
  return { id: 've-001', equityGrantId: 'eg-001', vestDate: new Date('2025-02-01'), unitsVested: 20, status: 'PENDING' as VestingEventStatus, ...overrides };
}

export function makeSurvey(overrides: DeepPartial<{
  id: string; companyId: string; title: string; status: SurveyStatus;
  isAnonymous: boolean; questions: any[];
}> = {}) {
  return { id: 'sv-001', companyId: 'comp-1', title: 'Employee Engagement', status: 'DRAFT' as SurveyStatus, isAnonymous: true, questions: [], ...overrides };
}

export function makeSurveyQuestion(overrides: DeepPartial<{
  id: string; surveyId: string; orderIndex: number; prompt: string;
  type: SurveyQuestionType; options: string[] | null; required: boolean;
}> = {}) {
  return { id: 'sq-001', surveyId: 'sv-001', orderIndex: 1, prompt: 'Rate satisfaction', type: 'LIKERT_5' as SurveyQuestionType, options: null, required: true, ...overrides };
}

export function makeSurveyAssignment(overrides: DeepPartial<{
  id: string; surveyId: string; employeeId: string; status: SurveyAssignmentStatus;
}> = {}) {
  return { id: 'sa-001', surveyId: 'sv-001', employeeId: 'emp-1', status: 'PENDING' as SurveyAssignmentStatus, ...overrides };
}

export function makeSurveyResponse(overrides: DeepPartial<{
  id: string; surveyId: string; questionId: string; answer: unknown; anonymousToken: string;
}> = {}) {
  return { id: 'sr-001', surveyId: 'sv-001', questionId: 'sq-001', answer: { value: '4' }, anonymousToken: 'tok-001', ...overrides };
}

export function makeExpenseReimbursement(overrides: DeepPartial<{
  id: string; employeeId: string; companyId: string; amount: string; category: string;
  status: ReimbursementStatus;
}> = {}) {
  return { id: 'er-001', employeeId: 'emp-1', companyId: 'comp-1', amount: '150.00', category: 'Travel', status: 'PENDING' as ReimbursementStatus, ...overrides };
}

export function makeSalaryAdvance(overrides: DeepPartial<{
  id: string; employeeId: string; companyId: string; principalAmount: string;
  outstandingBalance: string; recoveryInstallments: number; installmentAmount: string;
  status: SalaryAdvanceStatus;
}> = {}) {
  return { id: 'sa-001', employeeId: 'emp-1', companyId: 'comp-1', principalAmount: '5000.00', outstandingBalance: '5000.00', recoveryInstallments: 10, installmentAmount: '500.00', status: 'PENDING_APPROVAL' as SalaryAdvanceStatus, ...overrides };
}
