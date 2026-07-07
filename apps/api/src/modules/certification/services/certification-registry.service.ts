import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';

@Injectable()
export class CertificationRegistryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(dto: { companyId: string; name: string; issuingBody?: string; validityMonths?: number; isMandatoryForCompliance?: boolean; skillIds?: string[] }) {
    return this.prisma.unscopedClient.certification.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        issuingBody: dto.issuingBody,
        validityMonths: dto.validityMonths,
        isMandatoryForCompliance: dto.isMandatoryForCompliance ?? false,
        relatedSkills: dto.skillIds?.length ? { create: dto.skillIds.map((sid: string) => ({ skillId: sid })) } : undefined,
      },
      include: { relatedSkills: true },
    });
  }

  async update(id: string, dto: { name?: string; issuingBody?: string; validityMonths?: number; isMandatoryForCompliance?: boolean }) {
    const c = await this.prisma.unscopedClient.certification.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Certification not found');
    return this.prisma.unscopedClient.certification.update({ where: { id }, data: dto });
  }

  async list(companyId: string) {
    return this.prisma.unscopedClient.certification.findMany({
      where: { companyId },
      include: { relatedSkills: { include: { skill: true } } },
    });
  }

  async getById(id: string) {
    const c = await this.prisma.unscopedClient.certification.findUnique({
      where: { id }, include: { relatedSkills: { include: { skill: true } } },
    });
    if (!c) throw new NotFoundException('Certification not found');
    return c;
  }
}
