import type { CourseFormat, CourseStatusEnum, EnrollmentStatus, PathStatus, AssignmentTargetType, AssignmentScopeType, SkillStatusEnum, ValidationStatus, CertVerificationStatus } from '@prisma/client';

type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };

export function makeCourse(overrides: DeepPartial<{
  id: string; companyId: string; title: string; description: string | null;
  thumbnailKey: string | null; format: CourseFormat; externalUrl: string | null;
  durationMinutes: number; status: CourseStatusEnum; isMandatory: boolean;
  createdById: string; skillTags: any[];
}> = {}) {
  return {
    id: 'course-001', companyId: 'comp-001', title: 'Intro to Leadership',
    description: null, thumbnailKey: null, format: 'SELF_PACED' as CourseFormat,
    externalUrl: null, durationMinutes: 60, status: 'DRAFT' as CourseStatusEnum,
    isMandatory: false, createdById: 'admin-1', skillTags: [],
    ...overrides,
  };
}

export function makeEnrollment(overrides: DeepPartial<{
  id: string; courseId: string; employeeId: string; status: EnrollmentStatus;
  progressPercent: number; startedAt: Date | null; completedAt: Date | null;
  certificateKey: string | null; assignmentId: string | null;
}> = {}) {
  return {
    id: 'enr-001', courseId: 'course-001', employeeId: 'emp-001',
    status: 'NOT_STARTED' as EnrollmentStatus, progressPercent: 0,
    startedAt: null, completedAt: null, certificateKey: null, assignmentId: null,
    ...overrides,
  };
}

export function makeLearningPath(overrides: DeepPartial<{
  id: string; companyId: string; title: string; status: PathStatus; courses: any[];
}> = {}) {
  return { id: 'lp-001', companyId: 'comp-001', title: 'Leadership Path', status: 'DRAFT' as PathStatus, courses: [], ...overrides };
}

export function makeTrainingAssignment(overrides: DeepPartial<{
  id: string; companyId: string; targetType: AssignmentTargetType; targetId: string;
  scopeType: AssignmentScopeType; scopeFilter: Record<string, unknown>;
  deadlineAt: Date; isMandatory: boolean; reminderScheduleDaysBeforeDeadline: number[];
}> = {}) {
  return {
    id: 'ta-001', companyId: 'comp-001', targetType: 'COURSE' as AssignmentTargetType,
    targetId: 'course-001', scopeType: 'EMPLOYEE' as AssignmentScopeType,
    scopeFilter: { employeeIds: ['emp-001'] }, deadlineAt: new Date('2026-08-01'),
    isMandatory: true, reminderScheduleDaysBeforeDeadline: [14, 7, 1],
    ...overrides,
  };
}

export function makeSkill(overrides: DeepPartial<{
  id: string; companyId: string; name: string; category: string | null; status: SkillStatusEnum;
}> = {}) {
  return { id: 'skill-001', companyId: 'comp-001', name: 'Python', category: 'Technical', status: 'ACTIVE' as SkillStatusEnum, ...overrides };
}

export function makeEmployeeSkill(overrides: DeepPartial<{
  id: string; employeeId: string; skillId: string; selfAssessedLevel: number;
  managerValidatedLevel: number | null; validationStatus: ValidationStatus;
}> = {}) {
  return { id: 'es-001', employeeId: 'emp-001', skillId: 'skill-001', selfAssessedLevel: 3, managerValidatedLevel: null, validationStatus: 'PENDING' as ValidationStatus, ...overrides };
}

export function makeCertification(overrides: DeepPartial<{
  id: string; companyId: string; name: string; issuingBody: string | null;
  validityMonths: number | null; isMandatoryForCompliance: boolean;
}> = {}) {
  return { id: 'cert-001', companyId: 'comp-001', name: 'AWS Solutions Architect', issuingBody: 'Amazon', validityMonths: 36, isMandatoryForCompliance: false, ...overrides };
}

export function makeEmployeeCertification(overrides: DeepPartial<{
  id: string; employeeId: string; certificationId: string; credentialNumber: string | null;
  issuedDate: Date; expiryDate: Date | null; evidenceDocumentKey: string | null;
  verificationStatus: CertVerificationStatus;
}> = {}) {
  return { id: 'ec-001', employeeId: 'emp-001', certificationId: 'cert-001', credentialNumber: null, issuedDate: new Date('2025-01-01'), expiryDate: new Date('2028-01-01'), evidenceDocumentKey: null, verificationStatus: 'UNVERIFIED' as CertVerificationStatus, ...overrides };
}
