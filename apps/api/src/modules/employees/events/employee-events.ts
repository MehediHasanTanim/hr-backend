export const EMPLOYEE_HIRED = 'employee.hired';
export const EMPLOYEE_TERMINATED = 'employee.terminated';
export const EMPLOYEE_PROMOTED = 'employee.promoted';
export const EMPLOYEE_TRANSFERRED = 'employee.transferred';

export interface EmployeeLifecycleEvent {
  companyId: string;
  employeeId: string;
  actorUserId: string;
  effectiveDate: string;
}
