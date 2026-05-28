import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import type { Prisma } from '@prisma/client';
import type { EmployeeQueryDto, EmployeeWriteDto } from '../dto/employee.dto';

const employeeInclude = {
  department: true,
  jobTitle: true,
  location: true,
  payGrade: true,
  manager: { select: { id: true, employeeNumber: true, workEmail: true } },
  profile: true,
} satisfies Prisma.EmployeeInclude;

@Injectable()
export class EmployeeRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findMany(companyId: string, filters: EmployeeQueryDto) {
    const where: Prisma.EmployeeWhereInput = {
      companyId,
      deletedAt: null,
      ...(filters.department ? { departmentId: filters.department } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.location ? { locationId: filters.location } : {}),
      ...(filters.search
        ? {
          OR: [
            { employeeNumber: { contains: filters.search, mode: 'insensitive' } },
            { workEmail: { contains: filters.search, mode: 'insensitive' } },
            { user: { firstName: { contains: filters.search, mode: 'insensitive' } } },
            { user: { lastName: { contains: filters.search, mode: 'insensitive' } } },
          ],
        }
        : {}),
    };

    const [items, total] = await this.prisma.unscopedClient.$transaction([
      this.prisma.unscopedClient.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: { [filters.sortBy]: filters.sortOrder },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.unscopedClient.employee.count({ where }),
    ]);

    return {
      items,
      page: filters.page,
      pageSize: filters.pageSize,
      total,
    };
  }

  findById(companyId: string, id: string) {
    return this.prisma.unscopedClient.employee.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        ...employeeInclude,
        addresses: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        emergencyContacts: { where: { deletedAt: null }, orderBy: { name: 'asc' } },
        bankAccounts: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  create(companyId: string, data: EmployeeWriteDto & { employeeNumber: string }) {
    return this.prisma.unscopedClient.employee.create({
      data: this.toEmployeeCreateData(companyId, data),
      include: employeeInclude,
    });
  }

  update(companyId: string, id: string, data: EmployeeWriteDto) {
    return this.prisma.unscopedClient.employee.update({
      where: { id, companyId },
      data: this.toEmployeeUpdateData(data),
      include: employeeInclude,
    });
  }

  softDelete(companyId: string, id: string) {
    return this.prisma.unscopedClient.employee.update({
      where: { id, companyId },
      data: { deletedAt: new Date() },
    });
  }

  nextEmployeeNumber(companyId: string): Promise<number> {
    return this.prisma.unscopedClient.employee.count({ where: { companyId } });
  }

  private toEmployeeCreateData(
    companyId: string,
    dto: EmployeeWriteDto & { employeeNumber: string },
  ): Prisma.EmployeeCreateInput {
    const data: Prisma.EmployeeCreateInput = {
      company: { connect: { id: companyId } },
      employeeNumber: dto.employeeNumber,
      workEmail: dto.workEmail ?? dto.email ?? '',
      employmentType: dto.employmentType ?? 'FULL_TIME',
      status: dto.status ?? 'ACTIVE',
      joinedAt: dto.joinedAt ?? new Date(),
    };
    if (dto.workPhone !== undefined) data.workPhone = dto.workPhone;
    if (dto.probationEndsAt) data.probationEndsAt = dto.probationEndsAt;
    if (dto.lastWorkingDate) data.lastWorkingDate = dto.lastWorkingDate;
    if (dto.departmentId) data.department = { connect: { id: dto.departmentId } };
    if (dto.managerId) data.manager = { connect: { id: dto.managerId } };
    if (dto.jobTitleId) data.jobTitle = { connect: { id: dto.jobTitleId } };
    if (dto.locationId) data.location = { connect: { id: dto.locationId } };
    if (dto.payGradeId) data.payGrade = { connect: { id: dto.payGradeId } };
    return data;
  }

  private toEmployeeUpdateData(dto: EmployeeWriteDto): Prisma.EmployeeUpdateInput {
    return {
      ...(dto.workEmail || dto.email ? { workEmail: dto.workEmail ?? dto.email } : {}),
      ...(dto.workPhone !== undefined ? { workPhone: dto.workPhone } : {}),
      ...(dto.employmentType ? { employmentType: dto.employmentType } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.joinedAt ? { joinedAt: dto.joinedAt } : {}),
      ...(dto.probationEndsAt !== undefined ? { probationEndsAt: dto.probationEndsAt } : {}),
      ...(dto.lastWorkingDate !== undefined ? { lastWorkingDate: dto.lastWorkingDate } : {}),
      ...(dto.departmentId !== undefined
        ? { department: dto.departmentId ? { connect: { id: dto.departmentId } } : { disconnect: true } }
        : {}),
      ...(dto.managerId !== undefined
        ? { manager: dto.managerId ? { connect: { id: dto.managerId } } : { disconnect: true } }
        : {}),
      ...(dto.jobTitleId !== undefined
        ? { jobTitle: dto.jobTitleId ? { connect: { id: dto.jobTitleId } } : { disconnect: true } }
        : {}),
      ...(dto.locationId !== undefined
        ? { location: dto.locationId ? { connect: { id: dto.locationId } } : { disconnect: true } }
        : {}),
      ...(dto.payGradeId !== undefined
        ? { payGrade: dto.payGradeId ? { connect: { id: dto.payGradeId } } : { disconnect: true } }
        : {}),
    };
  }
}
