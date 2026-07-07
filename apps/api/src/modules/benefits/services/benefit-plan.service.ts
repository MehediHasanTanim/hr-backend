import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { round2dp } from '../../compensation/domain/compensation-math';

@Injectable()
export class BenefitPlanService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(dto: {
    companyId: string; name: string; type: string; employerContribution: number;
    employeeContribution: number; providerName: string; eligibilityRules?: Record<string, unknown>;
    coverageTiers?: Record<string, unknown>[]; providerDocumentS3Key?: string;
  }) {
    return this.prisma.unscopedClient.benefitPlan.create({
      data: {
        companyId: dto.companyId, name: dto.name, type: dto.type as any,
        employerContribution: round2dp(dto.employerContribution),
        employeeContribution: round2dp(dto.employeeContribution),
        providerName: dto.providerName, eligibilityRules: dto.eligibilityRules ?? undefined,
        coverageTiers: dto.coverageTiers ?? undefined, providerDocumentS3Key: dto.providerDocumentS3Key,
      },
    });
  }

  async update(id: string, dto: Record<string, unknown>) {
    const plan = await this.prisma.unscopedClient.benefitPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Benefit plan not found');
    return this.prisma.unscopedClient.benefitPlan.update({ where: { id }, data: dto as any });
  }

  async archive(id: string) {
    const plan = await this.prisma.unscopedClient.benefitPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Benefit plan not found');
    return this.prisma.unscopedClient.benefitPlan.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async listActive(companyId: string) {
    return this.prisma.unscopedClient.benefitPlan.findMany({ where: { companyId, status: 'ACTIVE' } });
  }

  async getById(id: string) {
    const plan = await this.prisma.unscopedClient.benefitPlan.findUnique({
      where: { id }, include: { enrollments: true },
    });
    if (!plan) throw new NotFoundException('Benefit plan not found');
    return plan;
  }
}
