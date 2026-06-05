import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { HolidayService } from '../../holiday/services/holiday.service';
import type { LeaveCalendarQueryDto } from '../dto/leave-request.dto';

interface CalendarDay {
  date: string;
  isHoliday: boolean;
  holidayName?: string;
  leaves: Array<{
    employeeId: string;
    employeeName: string;
    leaveType: string;
    status: 'approved' | 'pending';
  }>;
}

@Injectable()
export class LeaveCalendarService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HolidayService) private readonly holidays: HolidayService,
  ) {}

  async getCalendar(companyId: string, query: LeaveCalendarQueryDto): Promise<CalendarDay[]> {
    const { startDate, endDate, departmentId } = query;

    // Fetch all approved + pending leave requests in range
    const leaveRequests = await this.prisma.unscopedClient.leaveRequest.findMany({
      where: {
        companyId,
        status: { in: ['APPROVED', 'PENDING'] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        ...(departmentId ? { employee: { departmentId } } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            workEmail: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        leaveType: { select: { name: true } },
      },
      orderBy: { startDate: 'asc' },
    });

    // Fetch holidays in range
    const holidays = await this.holidays.getHolidaysInRange(companyId, startDate, endDate);

    // Build per-day structure
    const daysMap = new Map<string, CalendarDay>();

    // Initialize all days in range
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      daysMap.set(dateStr, {
        date: dateStr,
        isHoliday: false,
        leaves: [],
      });
      current.setUTCDate(current.getUTCDate() + 1);
    }

    // Mark holidays
    for (const holiday of holidays) {
      const dateStr = holiday.date.toISOString().split('T')[0];
      const day = daysMap.get(dateStr);
      if (day) {
        day.isHoliday = true;
        day.holidayName = holiday.name;
      }
    }

    // Add leaves to each day
    for (const request of leaveRequests) {
      const reqStart = new Date(request.startDate);
      const reqEnd = new Date(request.endDate);
      const reqCurrent = new Date(reqStart);

      const employeeName = request.employee.user
        ? `${request.employee.user.firstName} ${request.employee.user.lastName}`
        : request.employee.workEmail;

      while (reqCurrent <= reqEnd) {
        const dateStr = reqCurrent.toISOString().split('T')[0];
        const day = daysMap.get(dateStr);
        if (day) {
          day.leaves.push({
            employeeId: request.employee.id,
            employeeName,
            leaveType: request.leaveType.name,
            status: request.status.toLowerCase() as 'approved' | 'pending',
          });
        }
        reqCurrent.setUTCDate(reqCurrent.getUTCDate() + 1);
      }
    }

    return Array.from(daysMap.values());
  }
}
