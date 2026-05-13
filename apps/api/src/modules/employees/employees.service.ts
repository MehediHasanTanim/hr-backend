import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { NotFoundError } from '@hr/shared';
import { EmploymentType } from '@prisma/client';
import type { RequestContext } from '../../common/context/request-context';
import type { EmployeeWriteDto } from './dto/employee.dto';

@Injectable()
export class EmployeesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(user: RequestContext) {
    return this.prisma.forCompany(user.companyId).employee.findMany({
      where: { deletedAt: null },
      orderBy: { employeeNumber: 'asc' },
    });
  }

  async get(user: RequestContext, id: string) {
    const employee = await this.prisma.forCompany(user.companyId).employee.findFirst({
      where: { id, deletedAt: null },
    });
    if (!employee) throw new NotFoundError('Employee not found');
    return employee;
  }

  async create(user: RequestContext, dto: EmployeeWriteDto) {
    const count = await this.prisma.forCompany(user.companyId).employee.count();
    const workEmail = dto.workEmail ?? dto.email ?? `employee-${Date.now()}@test.hr`;
    const joinedAt = dto.joinedAt ? new Date(dto.joinedAt) : new Date();
    return this.prisma.forCompany(user.companyId).employee.create({
      data: {
        employeeNumber: `T${String(count + 1).padStart(5, '0')}`,
        workEmail,
        employmentType: dto.employmentType ?? EmploymentType.FULL_TIME,
        joinedAt,
        status: 'ACTIVE',
      },
    });
  }

  async update(user: RequestContext, id: string, dto: EmployeeWriteDto) {
    await this.get(user, id);
    const data = {
      ...(dto.workEmail ? { workEmail: dto.workEmail } : {}),
      ...(dto.email && !dto.workEmail ? { workEmail: dto.email } : {}),
      ...(dto.joinedAt ? { joinedAt: new Date(dto.joinedAt) } : {}),
      ...(dto.employmentType ? { employmentType: dto.employmentType } : {}),
    };
    return this.prisma.forCompany(user.companyId).employee.update({ where: { id }, data });
  }

  async remove(user: RequestContext, id: string) {
    await this.get(user, id);
    return this.prisma.forCompany(user.companyId).employee.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
