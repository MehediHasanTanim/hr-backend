import type { RequisitionStatus, EmploymentType, LocationType, CandidateSource, ApplicationStage, InterviewMode, InterviewStatus, PanelistRole, Recommendation, OfferStatus } from '@prisma/client';

type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };

export function buildJobRequisition(overrides: DeepPartial<{
  id: string; title: string; departmentId: string; requestedById: string;
  approvedById: string; status: RequisitionStatus; employmentType: EmploymentType;
  locationType: LocationType; headcountApproved: number; headcountFilled: number;
  publicSlug: string; publishedAt: Date; createdAt: Date;
}> = {}) {
  return {
    id: 'req-001',
    title: 'Senior Engineer',
    departmentId: 'dept-001',
    requestedById: 'emp-001',
    approvedById: null,
    status: 'OPEN' as RequisitionStatus,
    employmentType: 'FULL_TIME' as EmploymentType,
    locationType: 'ONSITE' as LocationType,
    headcountApproved: 1,
    headcountFilled: 0,
    publicSlug: 'senior-engineer-abc123',
    publishedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

export function buildCandidate(overrides: DeepPartial<{
  id: string; email: string; fullName: string; phone: string;
  resumeS3Key: string; source: CandidateSource; createdAt: Date;
}> = {}) {
  return {
    id: 'cand-001',
    email: 'candidate@test.com',
    fullName: 'John Doe',
    phone: '+1234567890',
    resumeS3Key: 'resumes/cand-001/resume.pdf',
    source: 'CAREERS_PAGE' as CandidateSource,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

export function buildApplication(overrides: DeepPartial<{
  id: string; candidateId: string; requisitionId: string;
  stage: ApplicationStage; score: number; rejectionReason: string;
  appliedAt: Date; lastStageChangeAt: Date; createdAt: Date;
  candidate: ReturnType<typeof buildCandidate>;
  requisition: ReturnType<typeof buildJobRequisition>;
}> = {}) {
  return {
    id: 'app-001',
    candidateId: 'cand-001',
    requisitionId: 'req-001',
    stage: 'APPLIED' as ApplicationStage,
    score: null,
    rejectionReason: null,
    appliedAt: new Date('2025-06-01'),
    lastStageChangeAt: null,
    createdAt: new Date('2025-06-01'),
    candidate: buildCandidate(),
    requisition: buildJobRequisition(),
    ...overrides,
  };
}

export function buildInterviewPanel(overrides: DeepPartial<{
  id: string; applicationId: string; scheduledAt: Date;
  durationMinutes: number; mode: InterviewMode;
  locationOrLink: string; status: InterviewStatus;
  createdById: string; createdAt: Date;
  panelists: ReturnType<typeof buildPanelist>[];
  scorecards: ReturnType<typeof buildScorecard>[];
}> = {}) {
  return {
    id: 'panel-001',
    applicationId: 'app-001',
    scheduledAt: new Date('2025-07-01T10:00:00Z'),
    durationMinutes: 60,
    mode: 'VIDEO' as InterviewMode,
    locationOrLink: 'https://meet.example.com/abc',
    status: 'SCHEDULED' as InterviewStatus,
    createdById: 'emp-001',
    createdAt: new Date('2025-06-15'),
    panelists: [],
    scorecards: [],
    ...overrides,
  };
}

export function buildPanelist(overrides: DeepPartial<{
  id: string; interviewPanelId: string; employeeId: string; role: PanelistRole;
}> = {}) {
  return {
    id: 'panelist-001',
    interviewPanelId: 'panel-001',
    employeeId: 'emp-001',
    role: 'LEAD' as PanelistRole,
    ...overrides,
  };
}

export function buildScorecard(overrides: DeepPartial<{
  id: string; interviewPanelId: string; panelistEmployeeId: string;
  recommendation: Recommendation; technicalScore: number;
  communicationScore: number; cultureFitScore: number;
  notes: string; submittedAt: Date; createdAt: Date;
}> = {}) {
  return {
    id: 'sc-001',
    interviewPanelId: 'panel-001',
    panelistEmployeeId: 'emp-001',
    recommendation: 'YES' as Recommendation,
    technicalScore: 4.0,
    communicationScore: 3.5,
    cultureFitScore: 4.0,
    notes: 'Good candidate',
    submittedAt: new Date('2025-07-01T11:00:00Z'),
    createdAt: new Date('2025-07-01T11:00:00Z'),
    ...overrides,
  };
}

export function buildOffer(overrides: DeepPartial<{
  id: string; applicationId: string; status: OfferStatus;
  baseSalary: number; bonus: number; equityValue: number;
  currency: string; startDate: Date; expiresAt: Date;
  offerLetterS3Key: string; eSignEnvelopeId: string;
  sentAt: Date; respondedAt: Date; declineReason: string;
  createdById: string; createdAt: Date;
  application: ReturnType<typeof buildApplication>;
}> = {}) {
  return {
    id: 'offer-001',
    applicationId: 'app-001',
    status: 'SENT' as OfferStatus,
    baseSalary: 100000,
    bonus: 10000,
    equityValue: 5000,
    currency: 'BDT',
    startDate: new Date('2025-08-01'),
    expiresAt: new Date('2025-07-15'),
    offerLetterS3Key: 'offers/offer-001/letter.pdf',
    eSignEnvelopeId: 'esign-123',
    sentAt: new Date('2025-07-01'),
    respondedAt: null,
    declineReason: null,
    createdById: 'emp-001',
    createdAt: new Date('2025-07-01'),
    application: buildApplication({ stage: 'OFFER' }),
    ...overrides,
  };
}
