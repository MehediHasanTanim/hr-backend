import type { TemplateStatus, TaskCategory, AssigneeRole, OnboardingStatus, TaskInstanceStatus, ReviewCycleType, ReviewCycleStatusEnum, PerformanceGoalType, PerformanceGoalStatus, ReviewStatus, RespondentRole, PipStatus } from '@prisma/client';

type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };

export function makeGoal(overrides: DeepPartial<{
  id: string; employeeId: string; parentGoalId: string; cycleId: string;
  title: string; goalType: PerformanceGoalType; targetValue: number;
  currentValue: number; status: PerformanceGoalStatus; dueDate: Date;
  childGoals: ReturnType<typeof makeGoal>[]; checkIns: ReturnType<typeof makeGoalCheckIn>[];
}> = {}) {
  return {
    id: 'goal-001', employeeId: 'emp-001', parentGoalId: null, cycleId: 'cycle-001',
    title: 'Improve Team Performance', goalType: 'OBJECTIVE' as PerformanceGoalType,
    targetValue: null, currentValue: null, status: 'NOT_STARTED' as PerformanceGoalStatus,
    dueDate: null, childGoals: [] as any[], checkIns: [] as any[],
    ...overrides,
  };
}

export function makeGoalTree(opts: { depth: number; childrenPerNode: number; prefix?: string; parentId?: string }): any[] {
  const { depth, childrenPerNode, prefix = 'goal', parentId } = opts;
  if (depth <= 0) return [];
  const goals: any[] = [];
  for (let i = 0; i < childrenPerNode; i++) {
    const id = `${prefix}-d${depth}-c${i}`;
    goals.push(makeGoal({ id, title: `Goal ${id}`, parentGoalId: parentId ?? null, childGoals: makeGoalTree({ depth: depth - 1, childrenPerNode, prefix: id, parentId: id }) }));
  }
  return goals;
}

export function makeGoalCheckIn(overrides: DeepPartial<{
  id: string; goalId: string; postedBy: string; progressNote: string;
  statusAtCheckIn: PerformanceGoalStatus; valueAtCheckIn: number;
}> = {}) {
  return { id: 'ci-001', goalId: 'goal-001', postedBy: 'emp-001', progressNote: 'Making progress', statusAtCheckIn: 'ON_TRACK' as PerformanceGoalStatus, valueAtCheckIn: 50, ...overrides };
}

export function makeReviewInstance(overrides: DeepPartial<{
  id: string; cycleId: string; employeeId: string; managerId: string;
  selfReviewStatus: ReviewStatus; managerReviewStatus: ReviewStatus;
  overallRating: string; acknowledgedByEmployee: boolean; responses: any[];
}> = {}) {
  return {
    id: 'rev-001', cycleId: 'cycle-001', employeeId: 'emp-001', managerId: 'emp-002',
    selfReviewStatus: 'NOT_STARTED' as ReviewStatus, managerReviewStatus: 'NOT_STARTED' as ReviewStatus,
    overallRating: null, acknowledgedByEmployee: false, responses: [],
    ...overrides,
  };
}

export function makeReviewResponse(overrides: DeepPartial<{
  id: string; reviewInstanceId: string; respondentRole: RespondentRole;
  sectionKey: string; responseJson: Record<string, unknown>; submittedAt: Date;
}> = {}) {
  return { id: 'resp-001', reviewInstanceId: 'rev-001', respondentRole: 'SELF' as RespondentRole, sectionKey: 'goals', responseJson: {}, submittedAt: null, ...overrides };
}

export function makeCalibrationOverride(overrides: DeepPartial<{
  id: string; reviewInstanceId: string; originalRating: string;
  overriddenRating: string; overriddenBy: string; justification: string;
}> = {}) {
  return { id: 'cal-001', reviewInstanceId: 'rev-001', originalRating: 'Meets', overriddenRating: 'Exceeds', overriddenBy: 'emp-hr', justification: 'Exceptional performance', ...overrides };
}

export function makeOnboardingTemplate(overrides: DeepPartial<{
  id: string; name: string; status: TemplateStatus; tasks: ReturnType<typeof makeTemplateTask>[];
}> = {}) {
  return { id: 'tmpl-001', name: 'Standard Onboarding', status: 'ACTIVE' as TemplateStatus, tasks: [], ...overrides };
}

export function makeTemplateTask(overrides: DeepPartial<{
  id: string; templateId: string; title: string; category: TaskCategory;
  dueDayOffset: number; assigneeRole: AssigneeRole;
}> = {}) {
  return { id: 'task-001', templateId: 'tmpl-001', title: 'Complete paperwork', category: 'PAPERWORK' as TaskCategory, dueDayOffset: 1, assigneeRole: 'EMPLOYEE' as AssigneeRole, ...overrides };
}

export function makeEmployeeOnboarding(overrides: DeepPartial<{
  id: string; employeeId: string; templateId: string; hireDate: Date;
  status: OnboardingStatus; taskInstances: ReturnType<typeof makeTaskInstance>[];
}> = {}) {
  return { id: 'eo-001', employeeId: 'emp-001', templateId: 'tmpl-001', hireDate: new Date('2025-06-01'), status: 'IN_PROGRESS' as OnboardingStatus, taskInstances: [], ...overrides };
}

export function makeTaskInstance(overrides: DeepPartial<{
  id: string; employeeOnboardingId: string; templateTaskId: string;
  title: string; assigneeRole: AssigneeRole; dueDate: Date;
  status: TaskInstanceStatus;
}> = {}) {
  return { id: 'ti-001', employeeOnboardingId: 'eo-001', templateTaskId: 'task-001', title: 'Complete paperwork', assigneeRole: 'EMPLOYEE' as AssigneeRole, dueDate: new Date('2025-06-02'), status: 'PENDING' as TaskInstanceStatus, ...overrides };
}
