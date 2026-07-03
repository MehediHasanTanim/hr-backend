import { Inject, Injectable, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { round2dp } from '../../payroll/utils/round2dp';
import type { RequestContext } from '../../../common/context/request-context';
import type {
  EmployeeSummaryResponseDto,
  TeamLeaveRequestDto,
  TeamLeaveRequestsResponseDto,
} from './dto/employee-summary.dto';
import type { TeamLeaveQueryDto } from './dto/team-leave-query.dto';
import type { LeaveBalance } from '@prisma/client';

// Role constants matching the existing role-based system
const MANAGER_ROLE = 'Manager';
const HR_ADMIN_ROLE = 'Admin';

@Injectable()
export class MssService {
  private readonly logger = new Logger(MssService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getEmployeeSummary(
    employeeId: string,
    actorId: string,
    actorRole: string,
  ): Promise<EmployeeSummaryResponseDto> {
    // Assert manager access
    await this.assertManagerAccess(actorId, actorRole, employeeId);

    const employee = await this.prisma.unscopedClient.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        department: { select: { name: true } },
        jobTitle: { select: { title: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const now = new Date();
    const currentMonthPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Gather data in parallel
    const [attendanceSummary, leaveBalances, pendingLeaveCount, lastPayroll] =
      await Promise.all([
        this.getAttendanceSummary(employeeId, monthStart, monthEnd),
        this.getLeaveBalances(employeeId),
        this.prisma.unscopedClient.leaveRequest.count({
          where: {
            employeeId,
            status: 'PENDING',
          },
        }),
        actorRole === HR_ADMIN_ROLE
          ? this.getLastPayrollNetPay(employeeId)
          : Promise.resolve(null),
      ]);

    return {
      employeeId: employee.id,
      name: `${employee.user?.firstName ?? ''} ${employee.user?.lastName ?? ''}`.trim(),
      jobTitle: employee.jobTitle?.title ?? '',
      department: employee.department?.name ?? '',
      attendanceSummary: {
        ...attendanceSummary,
        currentMonthPeriod,
      },
      leaveBalances,
      pendingLeaveRequests: pendingLeaveCount,
      lastPayrollNetPay: lastPayroll !== null ? round2dp(lastPayroll) : null,
    };
  }

  async getTeamLeaveRequests(
    actorId: string,
    actorRole: string,
    query: TeamLeaveQueryDto,
  ): Promise<TeamLeaveRequestsResponseDto> {
    const directReportIds = await this.getDirectReportIds(actorId);

    // HR_ADMIN can view all; MANAGER only direct reports
    const employeeFilter =
      actorRole === HR_ADMIN_ROLE
        ? {}
        : { employeeId: { in: directReportIds.length > 0 ? directReportIds : ['none'] } };

    const where: Record<string, unknown> = {
      ...employeeFilter,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate) {
      where.startDate = { gte: new Date(query.startDate) };
    }

    if (query.endDate) {
      where.endDate = { lte: new Date(query.endDate) };
    }

    const skip = (query.page - 1) * query.limit;

    const [data, total] = await Promise.all([
      this.prisma.unscopedClient.leaveRequest.findMany({
        where: where as any,
        include: {
          employee: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
          leaveType: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.unscopedClient.leaveRequest.count({ where: where as any }),
    ]);

    const mapped: TeamLeaveRequestDto[] = data.map((lr) => ({
      id: lr.id,
      employeeId: lr.employeeId,
      employeeName: `${lr.employee.user?.firstName ?? ''} ${lr.employee.user?.lastName ?? ''}`.trim(),
      leaveType: lr.leaveType.name,
      startDate: lr.startDate.toISOString().split('T')[0],
      endDate: lr.endDate.toISOString().split('T')[0],
      days: Number(lr.totalDays),
      status: lr.status,
      appliedAt: lr.createdAt.toISOString(),
    }));

    return {
      data: mapped,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private async getDirectReportIds(managerId: string): Promise<string[]> {
    const reports = await this.prisma.unscopedClient.employee.findMany({
      where: { managerId },
      select: { id: true },
    });
    return reports.map((r: { id: string }) => r.id);
  }

  private async assertManagerAccess(
    actorId: string,
    actorRole: string,
    targetEmployeeId: string,
  ): Promise<void> {
    if (actorRole === HR_ADMIN_ROLE) return;

    const isManager = await this.prisma.unscopedClient.employee.findFirst({
      where: {
        id: targetEmployeeId,
        managerId: actorId,
      },
      select: { id: true },
    });

    if (!isManager) {
      throw new ForbiddenException(
        'You can only view employees in your direct reporting line',
      );
    }
  }

  private async getAttendanceSummary(
    employeeId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<{ presentDays: number; absentDays: number; lateDays: number }> {
    const logs = await this.prisma.unscopedClient.attendanceLog.findMany({
      where: {
        employeeId,
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { status: true },
    });

    const presentDays = logs.filter((l: { status: string }) => l.status === 'PRESENT').length;
    const absentDays = logs.filter((l: { status: string }) => l.status === 'ABSENT').length;
    const lateDays = logs.filter((l: { status: string }) => l.status === 'LATE').length;

    return { presentDays, absentDays, lateDays };
  }

  private async getLeaveBalances(
    employeeId: string,
  ): Promise<{ leaveType: string; entitled: number; taken: number; remaining: number }[]> {
    const currentYear = new Date().getFullYear();

    const balances = await this.prisma.unscopedClient.leaveBalance.findMany({
      where: { employeeId, year: currentYear },
      include: { leaveType: { select: { name: true } } },
    });

    return balances.map((lb: LeaveBalance & { leaveType: { name: string } }) => ({
      leaveType: lb.leaveType.name,
      entitled: Number(lb.entitled),
      taken: Number(lb.used),
      remaining: Number(lb.balance),
    }));
  }

  private async getLastPayrollNetPay(employeeId: string): Promise<number | null> {
    const entry = await this.prisma.unscopedClient.payrollEntry.findFirst({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      select: { netPayable: true },
    });

    return entry ? Number(entry.netPayable) : null;
  }
}
