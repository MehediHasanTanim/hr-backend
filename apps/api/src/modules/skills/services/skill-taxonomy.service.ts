import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';

@Injectable()
export class SkillTaxonomyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createSkill(dto: { companyId: string; name: string; category?: string; parentSkillId?: string }) {
    return this.prisma.unscopedClient.skillTaxonomy.create({ data: dto });
  }

  async updateSkill(id: string, dto: { name?: string; category?: string }) {
    const s = await this.prisma.unscopedClient.skillTaxonomy.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Skill not found');
    return this.prisma.unscopedClient.skillTaxonomy.update({ where: { id }, data: dto });
  }

  async deprecateSkill(id: string) {
    const s = await this.prisma.unscopedClient.skillTaxonomy.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Skill not found');
    if (s.status === 'DEPRECATED') throw new BadRequestException('Skill already deprecated');
    return this.prisma.unscopedClient.skillTaxonomy.update({ where: { id }, data: { status: 'DEPRECATED' } });
  }

  async listSkills(filters: { companyId?: string; category?: string; status?: string }) {
    return this.prisma.unscopedClient.skillTaxonomy.findMany({
      where: { ...filters, status: filters.status ?? 'ACTIVE' } as any,
      orderBy: { name: 'asc' },
    });
  }

  async getSkillById(id: string) {
    const s = await this.prisma.unscopedClient.skillTaxonomy.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Skill not found');
    return s;
  }
}
