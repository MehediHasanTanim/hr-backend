import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { BadRequestError, NotFoundError } from '@hr/shared';
import type { AddHolidayDto, UpdateHolidayDto } from '../dto/holiday-calendar.dto';
import { HolidayCalendarService } from './holiday-calendar.service';

@Injectable()
export class HolidayService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HolidayCalendarService) private readonly calendars: HolidayCalendarService,
  ) {}

  async addHoliday(calendarId: string, companyId: string, dto: AddHolidayDto) {
    const calendar = await this.prisma.unscopedClient.holidayCalendar.findFirst({
      where: { id: calendarId, companyId },
    });
    if (!calendar) throw new NotFoundError('Holiday calendar not found');

    const existing = await this.prisma.unscopedClient.holiday.findFirst({
      where: { calendarId, date: dto.date },
    });
    if (existing) throw new BadRequestError('A holiday already exists on this date in the calendar');

    return this.prisma.unscopedClient.holiday.create({
      data: {
        calendarId,
        name: dto.name,
        date: dto.date,
        type: dto.type as 'PUBLIC' | 'OPTIONAL' | 'COMPANY',
      },
    });
  }

  async updateHoliday(id: string, companyId: string, dto: UpdateHolidayDto) {
    const holiday = await this.prisma.unscopedClient.holiday.findFirst({
      where: { id, calendar: { companyId } },
      include: { calendar: true },
    });
    if (!holiday) throw new NotFoundError('Holiday not found');

    if (dto.date) {
      const duplicate = await this.prisma.unscopedClient.holiday.findFirst({
        where: { calendarId, date: dto.date, id: { not: id } },
      });
      if (duplicate) throw new BadRequestError('A holiday already exists on this date in the calendar');
    }

    return this.prisma.unscopedClient.holiday.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.date !== undefined ? { date: dto.date } : {}),
        ...(dto.type !== undefined ? { type: dto.type as 'PUBLIC' | 'OPTIONAL' | 'COMPANY' } : {}),
      },
    });
  }

  async deleteHoliday(id: string, companyId: string) {
    const holiday = await this.prisma.unscopedClient.holiday.findFirst({
      where: { id, calendar: { companyId } },
    });
    if (!holiday) throw new NotFoundError('Holiday not found');

    await this.prisma.unscopedClient.holiday.delete({ where: { id } });
    return { deleted: true };
  }

  async listHolidays(calendarId: string, companyId: string) {
    const calendar = await this.prisma.unscopedClient.holidayCalendar.findFirst({
      where: { id: calendarId, companyId },
    });
    if (!calendar) throw new NotFoundError('Holiday calendar not found');

    return this.prisma.unscopedClient.holiday.findMany({
      where: { calendarId },
      orderBy: { date: 'asc' },
    });
  }

  async isHoliday(companyId: string, date: Date): Promise<boolean> {
    const year = date.getUTCFullYear();
    const calendar = await this.calendars.findDefaultCalendar(companyId, year);
    if (!calendar) return false;

    const holiday = await this.prisma.unscopedClient.holiday.findFirst({
      where: { calendarId: calendar.id, date },
    });
    return !!holiday;
  }

  async getHolidaysInRange(companyId: string, startDate: Date, endDate: Date) {
    const years = new Set<number>();
    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      years.add(d.getUTCFullYear());
    }

    const calendars = await this.prisma.unscopedClient.holidayCalendar.findMany({
      where: { companyId, year: { in: Array.from(years) }, isDefault: true },
    });

    if (calendars.length === 0) return [];

    const calendarIds = calendars.map((c) => c.id);

    return this.prisma.unscopedClient.holiday.findMany({
      where: {
        calendarId: { in: calendarIds },
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    });
  }
}
