import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { BadRequestError, NotFoundError, ConflictError } from '@hr/shared';
import type { CreateLeaveTypeDto, UpdateLeaveTypeDto } from '../dto/leave-type.dto';

@Injectable()
export class LeaveTypeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateLeaveTypeDto) {
    const existing = await this.prisma.unscopedClient.leaveType.findFirst({
      where: { companyId, code: dto.code },
    });
    if (existing) throw new ConflictError('Leave type code already exists for this company');

    return this.prisma.unscopedClient.leaveType.create({
      data: {
        companyId,
        name: dto.name,
        code: dto.code,
        accrualType: dto.accrualType as 'MONTHLY' | 'ANNUAL' | 'NONE',
        accrualAmount: dto.accrualAmount,
        maxCarryForward: dto.maxCarryForward,
        maxBalance: dto.maxBalance,
        isPaid: dto.isPaid,
        isActive: dto.isActive,
      },
    });
  }

  async update(id: string, companyId: string, dto: UpdateLeaveTypeDto) {
    const leaveType = await this.findOneOrFail(id, companyId);

    if (dto.code && dto.code !== leaveType.code) {
      const existing = await this.prisma.unscopedClient.leaveType.findFirst({
        where: { companyId, code: dto.code, id: { not: id } },
      });
      if (existing) throw new ConflictError('Leave type code already exists for this company');
    }

    return this.prisma.unscopedClient.leaveType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.accrualType !== undefined ? { accrualType: dto.accrualType as 'MONTHLY' | 'ANNUAL' | 'NONE' } : {}),
        ...(dto.accrualAmount !== undefined ? { accrualAmount: dto.accrualAmount } : {}),
        ...(dto.maxCarryForward !== undefined ? { maxCarryForward: dto.maxCarryForward } : {}),
        ...(dto.maxBalance !== undefined ? { maxBalance: dto.maxBalance } : {}),
        ...(dto.isPaid !== undefined ? { isPaid: dto.isPaid } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async softDelete(id: string, companyId: string) {
    const leaveType = await this.findOneOrFail(id, companyId);

    const pendingRequests = await this.prisma.unscopedClient.leaveRequest.count({
      where: { leaveTypeId: id, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (pendingRequests > 0) {
      throw new BadRequestError('Cannot delete leave type with pending or approved leave requests');
    }

    return this.prisma.unscopedClient.leaveType.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.unscopedClient.leaveType.findMany({
      where: { companyId, isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async findOneOrFail(id: string, companyId: string) {
    const leaveType = await this.prisma.unscopedClient.leaveType.findFirst({
      where: { id, companyId },
    });
    if (!leaveType) throw new NotFoundError('Leave type not found');
    return leaveType;
  }

  async findActiveByCompany(companyId: string) {
    return this.prisma.unscopedClient.leaveType.findMany({
      where: {
        companyId,
        isActive: true,
        accrualType: { not: 'NONE' },
      },
    });
  }
}
