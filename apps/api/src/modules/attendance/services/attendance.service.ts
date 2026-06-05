import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { BadRequestError, NotFoundError } from '@hr/shared';
import { AuditService } from '../../audit/audit.service';
import type { ClockInDto, AttendanceExceptionsQueryDto, CorrectAttendanceDto } from '../dto/attendance.dto';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async clockIn(employeeId: string, companyId: string, dto: ClockInDto, ipAddress?: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Check if already clocked in today
    const existing = await this.prisma.unscopedClient.attendanceLog.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (existing?.checkInAt) {
      return existing; // Idempotent: return existing
    }

    // Determine if late (TODO: use employee's shift from schedule module)
    // Default shift: 09:00
    const now = new Date();
    const shiftStart = new Date(now);
    shiftStart.setUTCHours(9, 0, 0, 0);
    const isLate = now > shiftStart;

    const status = isLate ? 'LATE' : 'PRESENT';

    const record = await this.prisma.unscopedClient.attendanceLog.upsert({
      where: { employeeId_date: { employeeId, date: today } },
      update: {
        checkInAt: now,
        source: dto.source as any ?? 'WEB',
        ipAddress: ipAddress ?? null,
        coordinates: dto.coordinates ?? undefined,
        status: status as any,
      },
      create: {
        companyId,
        employeeId,
        date: today,
        checkInAt: now,
        source: dto.source as any ?? 'WEB',
        ipAddress: ipAddress ?? null,
        coordinates: dto.coordinates ?? undefined,
        status: status as any,
      },
    });

    return record;
  }

  async clockOut(employeeId: string, companyId: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const record = await this.prisma.unscopedClient.attendanceLog.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (!record) {
      throw new NotFoundError('No clock-in found for today. Please clock in first.');
    }

    if (record.checkOutAt) {
      throw new BadRequestError('Already clocked out for today');
    }

    const now = new Date();
    const checkInAt = record.checkInAt!;
    const totalMinutes = Math.round((now.getTime() - checkInAt.getTime()) / 60000);

    let status = record.status;
    if (totalMinutes < 240) {
      status = 'HALF_DAY' as any;
    }

    const updated = await this.prisma.unscopedClient.attendanceLog.update({
      where: { id: record.id },
      data: {
        checkOutAt: now,
        workedMinutes: totalMinutes,
        status: status,
      },
    });

    return updated;
  }

  async getExceptions(
    companyId: string,
    query: AttendanceExceptionsQueryDto,
  ) {
    const { startDate, endDate, employeeId, type, page, pageSize } = query;

    if (type === 'late') {
      const where: any = {
        companyId,
        date: { gte: startDate, lte: endDate },
        status: 'LATE',
      };
      if (employeeId) where.employeeId = employeeId;

      const [items, total] = await this.prisma.unscopedClient.$transaction([
        this.prisma.unscopedClient.attendanceLog.findMany({
          where,
          include: { employee: { select: { id: true, workEmail: true, user: { select: { firstName: true, lastName: true } } } } },
          orderBy: { date: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.unscopedClient.attendanceLog.count({ where }),
      ]);

      return {
        items: items.map((r) => ({
          employeeId: r.employee.id,
          employeeName: r.employee.user
            ? `${r.employee.user.firstName} ${r.employee.user.lastName}`
            : r.employee.workEmail,
          date: r.date.toISOString().split('T')[0],
          type: 'late',
          detail: `Clocked in late at ${r.checkInAt?.toISOString() ?? 'unknown'}`,
        })),
        page,
        pageSize,
        total,
      };
    }

    if (type === 'missing_punch') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const where: any = {
        companyId,
        date: { gte: startDate, lte: endDate, lt: today },
        checkInAt: { not: null },
        checkOutAt: null,
      };
      if (employeeId) where.employeeId = employeeId;

      const [items, total] = await this.prisma.unscopedClient.$transaction([
        this.prisma.unscopedClient.attendanceLog.findMany({
          where,
          include: { employee: { select: { id: true, workEmail: true, user: { select: { firstName: true, lastName: true } } } } },
          orderBy: { date: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.unscopedClient.attendanceLog.count({ where }),
      ]);

      return {
        items: items.map((r) => ({
          employeeId: r.employee.id,
          employeeName: r.employee.user
            ? `${r.employee.user.firstName} ${r.employee.user.lastName}`
            : r.employee.workEmail,
          date: r.date.toISOString().split('T')[0],
          type: 'missing_punch',
          detail: `Checked in at ${r.checkInAt?.toISOString() ?? 'unknown'} but no check-out recorded`,
        })),
        page,
        pageSize,
        total,
      };
    }

    if (type === 'absent') {
      // Get all active employees
      const employees = await this.prisma.unscopedClient.employee.findMany({
        where: {
          companyId,
          status: 'ACTIVE',
          deletedAt: null,
          ...(employeeId ? { id: employeeId } : {}),
        },
        select: { id: true, workEmail: true, user: { select: { firstName: true, lastName: true } } },
      });

      // Get holidays in range
      const holidayWhere: any = {
        calendar: { companyId, isDefault: true },
        date: { gte: startDate, lte: endDate },
      };
      const holidays = await this.prisma.unscopedClient.holiday.findMany({
        where: holidayWhere,
        select: { date: true },
      });
      const holidayDates = new Set(holidays.map((h) => h.date.toISOString().split('T')[0]));

      // Generate working days (exclude weekends and holidays)
      const workingDays: string[] = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        const dow = current.getUTCDay();
        const dateStr = current.toISOString().split('T')[0];
        if (dow !== 0 && dow !== 6 && !holidayDates.has(dateStr)) {
          workingDays.push(dateStr);
        }
        current.setUTCDate(current.getUTCDate() + 1);
      }

      // Get all attendance records in range
      const records = await this.prisma.unscopedClient.attendanceLog.findMany({
        where: {
          companyId,
          date: { gte: startDate, lte: endDate },
          ...(employeeId ? { employeeId } : {}),
        },
        select: { employeeId: true, date: true },
      });

      const recordSet = new Set(records.map((r) => `${r.employeeId}_${r.date.toISOString().split('T')[0]}`));

      // Find absent employees
      const absentItems: Array<{
        employeeId: string;
        employeeName: string;
        date: string;
        type: string;
        detail: string;
      }> = [];

      for (const emp of employees) {
        for (const day of workingDays) {
          if (!recordSet.has(`${emp.id}_${day}`)) {
            absentItems.push({
              employeeId: emp.id,
              employeeName: emp.user
                ? `${emp.user.firstName} ${emp.user.lastName}`
                : emp.workEmail,
              date: day,
              type: 'absent',
              detail: 'No attendance record for working day',
            });
          }
        }
      }

      // Paginate
      const total = absentItems.length;
      const paginatedItems = absentItems.slice((page - 1) * pageSize, page * pageSize);

      return { items: paginatedItems, page, pageSize, total };
    }

    return { items: [], page, pageSize, total: 0 };
  }

  async correctRecord(
    recordId: string,
    companyId: string,
    correctedById: string,
    dto: CorrectAttendanceDto,
  ) {
    const record = await this.prisma.unscopedClient.attendanceLog.findFirst({
      where: { id: recordId, companyId },
    });
    if (!record) throw new NotFoundError('Attendance record not found');

    const before = {
      clockInAt: record.checkInAt?.toISOString() ?? null,
      clockOutAt: record.checkOutAt?.toISOString() ?? null,
      status: record.status,
    };

    const updateData: any = {
      isCorrected: true,
      correctionReason: dto.reason,
      correctedById,
      correctedAt: new Date(),
      source: 'MANUAL',
    };

    if (dto.clockInAt) {
      updateData.checkInAt = new Date(dto.clockInAt);
    }
    if (dto.clockOutAt) {
      updateData.checkOutAt = new Date(dto.clockOutAt);
    }

    // Recalculate totalMinutes and status
    if (updateData.checkInAt && updateData.checkOutAt) {
      const totalMinutes = Math.round(
        (updateData.checkOutAt.getTime() - updateData.checkInAt.getTime()) / 60000,
      );
      updateData.workedMinutes = totalMinutes;

      if (dto.status) {
        updateData.status = dto.status;
      } else {
        // Recalculate status
        updateData.status = totalMinutes < 240 ? 'HALF_DAY' : (record.status === 'LATE' ? 'LATE' : 'PRESENT');
      }
    } else if (dto.clockInAt && !dto.clockOutAt) {
      // Only check-in corrected
      const shiftStart = new Date(updateData.checkInAt);
      shiftStart.setUTCHours(9, 0, 0, 0);
      const isLate = updateData.checkInAt > shiftStart;

      if (dto.status) {
        updateData.status = dto.status;
      } else {
        updateData.status = isLate ? 'LATE' : 'PRESENT';
      }
    } else if (dto.status) {
      updateData.status = dto.status;
    }

    const updated = await this.prisma.unscopedClient.attendanceLog.update({
      where: { id: recordId },
      data: updateData,
    });

    // Audit log
    await this.audit.record({
      companyId,
      entityType: 'attendance_record',
      entityId: recordId,
      action: 'ATTENDANCE_CORRECTED',
      oldValue: before as any,
      newValue: {
        clockInAt: updated.checkInAt?.toISOString() ?? null,
        clockOutAt: updated.checkOutAt?.toISOString() ?? null,
        status: updated.status,
      } as any,
    });

    return updated;
  }
}
