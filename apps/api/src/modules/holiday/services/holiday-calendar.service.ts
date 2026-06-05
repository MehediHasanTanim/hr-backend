import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { BadRequestError, NotFoundError } from '@hr/shared';
import type { CreateHolidayCalendarDto, UpdateHolidayCalendarDto } from '../dto/holiday-calendar.dto';

@Injectable()
export class HolidayCalendarService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createCalendar(companyId: string, dto: CreateHolidayCalendarDto) {
    return this.prisma.unscopedClient.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.holidayCalendar.updateMany({
          where: { companyId, year: dto.year, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.holidayCalendar.create({
        data: {
          companyId,
          name: dto.name,
          year: dto.year,
          isDefault: dto.isDefault,
        },
      });
    });
  }

  async updateCalendar(companyId: string, id: string, dto: UpdateHolidayCalendarDto) {
    const calendar = await this.prisma.unscopedClient.holidayCalendar.findFirst({
      where: { id, companyId },
    });
    if (!calendar) throw new NotFoundError('Holiday calendar not found');

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.holidayCalendar.updateMany({
          where: { companyId, year: calendar.year, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.holidayCalendar.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
    });
  }

  async deleteCalendar(companyId: string, id: string) {
    const calendar = await this.prisma.unscopedClient.holidayCalendar.findFirst({
      where: { id, companyId },
    });
    if (!calendar) throw new NotFoundError('Holiday calendar not found');

    await this.prisma.unscopedClient.holidayCalendar.delete({ where: { id } });
    return { deleted: true };
  }

  async listCalendars(companyId: string, year?: number) {
    const where: { companyId: string; year?: number } = { companyId };
    if (year !== undefined) where.year = year;

    return this.prisma.unscopedClient.holidayCalendar.findMany({
      where,
      orderBy: { year: 'desc' },
      include: { _count: { select: { holidays: true } } },
    });
  }

  async findDefaultCalendar(companyId: string, year: number) {
    const calendar = await this.prisma.unscopedClient.holidayCalendar.findFirst({
      where: { companyId, year, isDefault: true },
      include: { holidays: { orderBy: { date: 'asc' } } },
    });
    return calendar;
  }
}
