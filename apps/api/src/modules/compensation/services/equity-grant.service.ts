import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { computeVestingSchedule } from '../domain/compensation-math';

@Injectable()
export class EquityGrantService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createGrant(dto: {
    employeeId: string; instrumentType: string; totalUnits: number;
    strikePrice?: number; grantDate: string; vestingStartDate: string;
    cliffMonths: number; vestingDurationMonths: number; vestingFrequency: string;
  }) {
    const schedule = computeVestingSchedule({
      totalUnits: dto.totalUnits, cliffMonths: dto.cliffMonths,
      vestingDurationMonths: dto.vestingDurationMonths,
      vestingFrequency: dto.vestingFrequency as 'MONTHLY' | 'QUARTERLY',
      vestingStartDate: dto.vestingStartDate,
    });

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      const grant = await tx.equityGrant.create({
        data: {
          employeeId: dto.employeeId, instrumentType: dto.instrumentType as any,
          totalUnits: dto.totalUnits, strikePrice: dto.strikePrice,
          grantDate: new Date(dto.grantDate), vestingStartDate: new Date(dto.vestingStartDate),
          cliffMonths: dto.cliffMonths, vestingDurationMonths: dto.vestingDurationMonths,
          vestingFrequency: dto.vestingFrequency as any,
        },
      });

      for (const event of schedule) {
        await tx.vestingEvent.create({
          data: { equityGrantId: grant.id, vestDate: new Date(event.vestDate), unitsVested: event.unitsVested },
        });
      }

      return tx.equityGrant.findUnique({ where: { id: grant.id }, include: { vestingEvents: { orderBy: { vestDate: 'asc' } } } });
    });
  }

  async cancelGrant(id: string) {
    const grant = await this.prisma.unscopedClient.equityGrant.findUnique({ where: { id } });
    if (!grant) throw new NotFoundException('Grant not found');
    if (grant.status === 'CANCELLED') throw new NotFoundException('Grant already cancelled');

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.vestingEvent.updateMany({
        where: { equityGrantId: id, status: 'PENDING' },
        data: { status: 'SKIPPED_CLIFF_NOT_MET' },
      });
      return tx.equityGrant.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
  }

  async getEmployeeGrants(employeeId: string) {
    return this.prisma.unscopedClient.equityGrant.findMany({
      where: { employeeId },
      include: { vestingEvents: { orderBy: { vestDate: 'asc' } } },
      orderBy: { grantDate: 'desc' },
    });
  }

  async getById(id: string) {
    const grant = await this.prisma.unscopedClient.equityGrant.findUnique({
      where: { id }, include: { vestingEvents: { orderBy: { vestDate: 'asc' } } },
    });
    if (!grant) throw new NotFoundException('Grant not found');
    return grant;
  }
}
