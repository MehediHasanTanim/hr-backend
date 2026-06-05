import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '@hr/shared';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { DomainEventsService } from '../../employees/events/domain-events.service';
import { HolidayService } from '../../holiday/services/holiday.service';
import type { ApplyLeaveDto, RejectLeaveDto } from '../dto/leave-request.dto';

@Injectable()
export class LeaveRequestService {
  private readonly logger = new Logger(LeaveRequestService.name);

  private readonly teamCapacityLimit = 3; // Configurable per company

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventsService) private readonly events: DomainEventsService,
    @Inject(HolidayService) private readonly holidays: HolidayService,
  ) {}

  async apply(employeeId: string, companyId: string, dto: ApplyLeaveDto) {
    // Validation 1: startDate must not be in the past
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (dto.startDate < today) {
      throw new BadRequestError('startDate must not be in the past');
    }

    // Validation 2: startDate <= endDate (enforced by schema)

    // Validation 3: Calculate working days (exclude weekends and holidays)
    const totalDays = await this.calculateWorkingDays(companyId, dto.startDate, dto.endDate);
    if (totalDays < 1) {
      throw new BadRequestError('Leave request must span at least 1 working day');
    }

    // Validation 4: Balance check
    const startYear = dto.startDate.getUTCFullYear();
    const endYear = dto.endDate.getUTCFullYear();

    if (startYear === endYear) {
      const balance = await this.prisma.unscopedClient.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId,
            leaveTypeId: dto.leaveTypeId,
            year: startYear,
          },
        },
      });
      if (!balance || Number(balance.balance) < totalDays) {
        throw new BadRequestError('Insufficient leave balance');
      }
    } else {
      // Spans two years - split and check
      const endOfStartYear = new Date(Date.UTC(startYear, 11, 31));
      const daysInStartYear = await this.calculateWorkingDays(companyId, dto.startDate, endOfStartYear);
      const daysInEndYear = totalDays - daysInStartYear;

      const startBalance = await this.prisma.unscopedClient.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: dto.leaveTypeId, year: startYear } },
      });
      const endBalance = await this.prisma.unscopedClient.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: dto.leaveTypeId, year: endYear } },
      });

      if ((!startBalance || Number(startBalance.balance) < daysInStartYear) ||
          (!endBalance || Number(endBalance.balance) < daysInEndYear)) {
        throw new BadRequestError('Insufficient leave balance across years');
      }
    }

    // Validation 5: Holiday conflict - check if every day is a holiday/weekend
    const allHoliday = await this.isAllHolidayOrWeekend(companyId, dto.startDate, dto.endDate);
    if (allHoliday) {
      throw new BadRequestError('All days in the requested range are holidays or weekends');
    }

    // Validation 6: Team capacity check
    const employee = await this.prisma.unscopedClient.employee.findUnique({
      where: { id: employeeId },
      select: { departmentId: true },
    });

    if (employee?.departmentId) {
      const overlappingCount = await this.prisma.unscopedClient.leaveRequest.count({
        where: {
          employee: { departmentId: employee.departmentId },
          status: { in: ['PENDING', 'APPROVED'] },
          startDate: { lte: dto.endDate },
          endDate: { gte: dto.startDate },
          id: { not: undefined }, // Exclude current request
        },
      });

      if (overlappingCount >= this.teamCapacityLimit) {
        throw new ConflictError(
          JSON.stringify({
            message: 'Team capacity limit reached for this period',
            canOverride: true,
            overlappingCount,
            limit: this.teamCapacityLimit,
          }),
        );
      }
    }

    // Execute within UnitOfWork
    let request: any;
    await this.prisma.unscopedClient.$transaction(async (tx) => {
      request = await tx.leaveRequest.create({
        data: {
          companyId,
          employeeId,
          leaveTypeId: dto.leaveTypeId,
          startDate: dto.startDate,
          endDate: dto.endDate,
          totalDays,
          reason: dto.reason ?? undefined,
          status: 'PENDING',
        },
      });
    });

    // Emit event and audit log after transaction
    const leaveType = await this.prisma.unscopedClient.leaveType.findUnique({
      where: { id: dto.leaveTypeId },
      select: { name: true },
    });

    this.events.emit('leave.requested', {
      requestId: request.id,
      employeeId,
      startDate: dto.startDate.toISOString(),
      endDate: dto.endDate.toISOString(),
      totalDays,
      leaveTypeName: leaveType?.name ?? 'Unknown',
    });

    await this.audit.record({
      companyId,
      entityType: 'leave_request',
      entityId: request.id,
      action: 'LEAVE_REQUEST_CREATED',
      newValue: {
        employeeId,
        leaveTypeId: dto.leaveTypeId,
        startDate: dto.startDate.toISOString(),
        endDate: dto.endDate.toISOString(),
        totalDays,
      } as any,
    });

    return request;
  }

  async approve(requestId: string, approverEmployeeId: string, companyId: string) {
    const request = await this.prisma.unscopedClient.leaveRequest.findFirst({
      where: { id: requestId, companyId },
      include: { employee: { select: { departmentId: true, managerId: true } } },
    });
    if (!request) throw new NotFoundError('Leave request not found');
    if (request.status !== 'PENDING') throw new BadRequestError('Only pending requests can be approved');

    // Assert approver is a manager or HR (simplified: check if same company)
    const approver = await this.prisma.unscopedClient.employee.findFirst({
      where: { id: approverEmployeeId, companyId },
    });
    if (!approver) throw new NotFoundError('Approver not found in company');

    const totalDays = Number(request.totalDays);

    await this.prisma.unscopedClient.$transaction(async (tx) => {
      // Update request status
      await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          reviewedById: approverEmployeeId,
          reviewedAt: new Date(),
        },
      });

      // Deduct from balance
      const startYear = request.startDate.getUTCFullYear();
      const endYear = request.endDate.getUTCFullYear();

      if (startYear === endYear) {
        await this.deductBalance(tx, request.employeeId, request.leaveTypeId, startYear, totalDays);
      } else {
        const endOfStartYear = new Date(Date.UTC(startYear, 11, 31));
        const daysInStart = await this.calculateWorkingDays(companyId, request.startDate, endOfStartYear);
        const daysInEnd = totalDays - daysInStart;

        if (daysInStart > 0) {
          await this.deductBalance(tx, request.employeeId, request.leaveTypeId, startYear, daysInStart);
        }
        if (daysInEnd > 0) {
          await this.deductBalance(tx, request.employeeId, request.leaveTypeId, endYear, daysInEnd);
        }
      }
    });

    // Emit and audit after transaction
    this.events.emit('leave.approved', {
      requestId,
      approverId: approverEmployeeId,
      employeeId: request.employeeId,
      totalDays,
    });

    await this.audit.record({
      companyId,
      entityType: 'leave_request',
      entityId: requestId,
      action: 'LEAVE_REQUEST_APPROVED',
      newValue: { status: 'APPROVED', approvedById: approverEmployeeId } as any,
    });

    return { id: requestId, status: 'APPROVED' };
  }

  async reject(requestId: string, approverEmployeeId: string, companyId: string, dto: RejectLeaveDto) {
    const request = await this.prisma.unscopedClient.leaveRequest.findFirst({
      where: { id: requestId, companyId },
    });
    if (!request) throw new NotFoundError('Leave request not found');
    if (request.status !== 'PENDING') throw new BadRequestError('Only pending requests can be rejected');

    await this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          reviewedById: approverEmployeeId,
          reviewedAt: new Date(),
          rejectionReason: dto.rejectionReason,
        },
      });
    });

    this.events.emit('leave.rejected', {
      requestId,
      approverId: approverEmployeeId,
      reason: dto.rejectionReason,
    });

    await this.audit.record({
      companyId,
      entityType: 'leave_request',
      entityId: requestId,
      action: 'LEAVE_REQUEST_REJECTED',
      newValue: { status: 'REJECTED', reason: dto.rejectionReason } as any,
    });

    return { id: requestId, status: 'REJECTED' };
  }

  async cancel(requestId: string, requestingEmployeeId: string, companyId: string) {
    const request = await this.prisma.unscopedClient.leaveRequest.findFirst({
      where: { id: requestId, companyId, employeeId: requestingEmployeeId },
    });
    if (!request) throw new NotFoundError('Leave request not found');
    if (!['PENDING', 'APPROVED'].includes(request.status)) {
      throw new BadRequestError('Only pending or approved requests can be cancelled');
    }

    const totalDays = Number(request.totalDays);

    await this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });

      // If cancelling an approved request, restore balance
      if (request.status === 'APPROVED') {
        const startYear = request.startDate.getUTCFullYear();
        const endYear = request.endDate.getUTCFullYear();

        if (startYear === endYear) {
          await this.restoreBalance(tx, request.employeeId, request.leaveTypeId, startYear, totalDays);
        } else {
          const endOfStartYear = new Date(Date.UTC(startYear, 11, 31));
          const daysInStart = await this.calculateWorkingDays(companyId, request.startDate, endOfStartYear);
          const daysInEnd = totalDays - daysInStart;

          if (daysInStart > 0) {
            await this.restoreBalance(tx, request.employeeId, request.leaveTypeId, startYear, daysInStart);
          }
          if (daysInEnd > 0) {
            await this.restoreBalance(tx, request.employeeId, request.leaveTypeId, endYear, daysInEnd);
          }
        }
      }
    });

    this.events.emit('leave.cancelled', {
      requestId,
      employeeId: requestingEmployeeId,
    });

    await this.audit.record({
      companyId,
      entityType: 'leave_request',
      entityId: requestId,
      action: 'LEAVE_REQUEST_CANCELLED',
      newValue: { status: 'CANCELLED' } as any,
    });

    return { id: requestId, status: 'CANCELLED' };
  }

  private async deductBalance(
    tx: Prisma.TransactionClient,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    days: number,
  ) {
    const balance = await tx.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    });
    if (!balance) throw new BadRequestError('Leave balance not found');

    const newUsed = Number(balance.used) + days;
    const newBalance = Number(balance.carriedForward) + Number(balance.entitled) - newUsed;

    if (newBalance < 0) {
      throw new BadRequestError('Insufficient leave balance for approval');
    }

    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: { used: newUsed, balance: newBalance },
    });
  }

  private async restoreBalance(
    tx: Prisma.TransactionClient,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    days: number,
  ) {
    const balance = await tx.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    });
    if (!balance) return;

    const newUsed = Math.max(0, Number(balance.used) - days);
    const newBalance = Number(balance.carriedForward) + Number(balance.entitled) - newUsed;

    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: { used: newUsed, balance: newBalance },
    });
  }

  private async calculateWorkingDays(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const holidays = await this.holidays.getHolidaysInRange(companyId, startDate, endDate);
    const holidayDates = new Set(holidays.map((h) => h.date.toISOString().split('T')[0]));

    let workingDays = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
      const dayOfWeek = current.getUTCDay();
      const dateStr = current.toISOString().split('T')[0];

      // Exclude weekends (Saturday=6, Sunday=0)
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateStr)) {
        workingDays++;
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return workingDays;
  }

  private async isAllHolidayOrWeekend(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<boolean> {
    const holidays = await this.holidays.getHolidaysInRange(companyId, startDate, endDate);
    const holidayDates = new Set(holidays.map((h) => h.date.toISOString().split('T')[0]));

    const current = new Date(startDate);
    while (current <= endDate) {
      const dayOfWeek = current.getUTCDay();
      const dateStr = current.toISOString().split('T')[0];

      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateStr)) {
        return false; // Found a working day
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return true; // All days are holidays or weekends
  }
}
