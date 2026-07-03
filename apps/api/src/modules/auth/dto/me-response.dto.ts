export interface LeaveBalanceSummaryDto {
  leaveType: string;
  entitled: number;
  taken: number;
  remaining: number;
}

export interface MeResponseDto {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string;
  departmentName: string;
  jobTitle: string;
  leaveBalances: LeaveBalanceSummaryDto[];
  pendingTaskCount: number;
  unreadNotificationCount: number;
}
