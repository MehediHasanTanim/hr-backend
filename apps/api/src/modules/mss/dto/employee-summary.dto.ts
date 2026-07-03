export interface LeaveBalanceSummaryDto {
  leaveType: string;
  entitled: number;
  taken: number;
  remaining: number;
}

export interface EmployeeSummaryResponseDto {
  employeeId: string;
  name: string;
  jobTitle: string;
  department: string;
  attendanceSummary: {
    presentDays: number;
    absentDays: number;
    lateDays: number;
    currentMonthPeriod: string;
  };
  leaveBalances: LeaveBalanceSummaryDto[];
  pendingLeaveRequests: number;
  lastPayrollNetPay: number | null;
}

export interface TeamLeaveRequestDto {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  appliedAt: string;
}

export interface TeamLeaveRequestsResponseDto {
  data: TeamLeaveRequestDto[];
  total: number;
  page: number;
  limit: number;
}
