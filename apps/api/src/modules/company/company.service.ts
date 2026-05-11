import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { NotFoundError } from '@hr/shared';
import type { Company, CompanySetting, Prisma } from '@prisma/client';
import type { UpdateCompanyDto } from './dto/company.dto';

@Injectable()
export class CompanyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getCompany(companyId: string): Promise<Company> {
    const company = await this.prisma.unscopedClient.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });
    if (!company) throw new NotFoundError('Company not found');
    return company;
  }

  updateCompany(companyId: string, dto: UpdateCompanyDto): Promise<Company> {
    return this.prisma.unscopedClient.company.update({
      where: { id: companyId },
      data: dto,
    });
  }

  getSettings(companyId: string): Promise<CompanySetting[]> {
    return this.prisma.forCompany(companyId).companySetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  upsertSetting(companyId: string, key: string, value: unknown): Promise<CompanySetting> {
    return this.prisma.unscopedClient.companySetting.upsert({
      where: { companyId_key: { companyId, key } },
      update: { value: value as Prisma.InputJsonValue },
      create: { companyId, key, value: value as Prisma.InputJsonValue },
    });
  }

  async getStats(companyId: string) {
    const [headcount, activeEmployees, pendingLeaveRequests] = await Promise.all([
      this.prisma.forCompany(companyId).employee.count(),
      this.prisma.forCompany(companyId).employee.count({ where: { status: 'ACTIVE' } }),
      this.prisma.forCompany(companyId).leaveRequest.count({ where: { status: 'PENDING' } }),
    ]);
    return { headcount, activeEmployees, pendingRequests: pendingLeaveRequests };
  }
}
