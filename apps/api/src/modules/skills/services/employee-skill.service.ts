import { Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EmployeeSkillService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async selfAssess(employeeId: string, skillId: string, level: number) {
    const skill = await this.prisma.unscopedClient.skillTaxonomy.findUnique({ where: { id: skillId } });
    if (!skill || skill.status !== 'ACTIVE') throw new NotFoundException('Skill not found or not active');

    const existing = await this.prisma.unscopedClient.employeeSkill.findUnique({
      where: { employeeId_skillId: { employeeId, skillId } },
    });

    // If previously validated and self-assessed level changed, reset validation
    if (existing && existing.validationStatus === 'VALIDATED' && existing.selfAssessedLevel !== level) {
      return this.prisma.unscopedClient.employeeSkill.update({
        where: { id: existing.id },
        data: {
          selfAssessedLevel: level,
          validationStatus: 'PENDING',
          managerValidatedLevel: null,
          validatedById: null,
          validatedAt: null,
        },
      });
    }

    return this.prisma.unscopedClient.employeeSkill.upsert({
      where: { employeeId_skillId: { employeeId, skillId } },
      create: { employeeId, skillId, selfAssessedLevel: level },
      update: { selfAssessedLevel: level },
    });
  }

  async managerValidate(employeeSkillId: string, validatedLevel: number, actorId: string, disputeThreshold: number = 2) {
    const es = await this.prisma.unscopedClient.employeeSkill.findUnique({ where: { id: employeeSkillId } });
    if (!es) throw new NotFoundException('Employee skill not found');

    // In production: validate actorId is the employee's manager via org-chart service

    const diff = Math.abs(validatedLevel - es.selfAssessedLevel);
    const validationStatus = diff > disputeThreshold ? 'DISPUTED' : 'VALIDATED';

    const result = await this.prisma.unscopedClient.employeeSkill.update({
      where: { id: employeeSkillId },
      data: {
        managerValidatedLevel: validatedLevel,
        validationStatus: validationStatus as any,
        validatedById: actorId,
        validatedAt: new Date(),
      },
    });

    if (validationStatus === 'DISPUTED') {
      this.events.emit('skill.disputed', { employeeSkillId, employeeId: es.employeeId, skillId: es.skillId, selfLevel: es.selfAssessedLevel, managerLevel: validatedLevel });
    }

    return result;
  }

  async getSkillsMatrix(filters: { companyId?: string; departmentId?: string; skillCategory?: string }) {
    // Read-replica pivot query: rows = employees, columns = skills
    const skills = await this.prisma.unscopedClient.skillTaxonomy.findMany({
      where: { ...(filters.skillCategory ? { category: filters.skillCategory } : {}), status: 'ACTIVE' } as any,
    });

    const employeeSkills = await this.prisma.unscopedClient.employeeSkill.findMany({
      where: { skillId: { in: skills.map(s => s.id) } },
      include: { skill: true },
      orderBy: { employeeId: 'asc' },
    });

    return { skills, employeeSkills };
  }

  async getGapAnalysis(targetRoleId?: string, targetSkillProfile?: Record<string, number>) {
    // Compares required skill levels against each employee's validated (or self-assessed) levels
    let requiredSkills: Record<string, number> = targetSkillProfile ?? {};

    if (targetRoleId) {
      // Stub: In production, fetch from role_skill_requirements join table
      throw new BadRequestException('Role-based skill requirements not yet implemented — use targetSkillProfile');
    }

    const employeeSkills = await this.prisma.unscopedClient.employeeSkill.findMany({
      where: { skillId: { in: Object.keys(requiredSkills) } },
      include: { skill: true },
    });

    // Group by employee, compute deltas
    const gapsByEmployee: Record<string, Record<string, number>> = {};
    for (const es of employeeSkills) {
      const actualLevel = es.managerValidatedLevel ?? es.selfAssessedLevel;
      const requiredLevel = requiredSkills[es.skillId] ?? 0;
      const delta = requiredLevel - actualLevel;
      if (!gapsByEmployee[es.employeeId]) gapsByEmployee[es.employeeId] = {};
      gapsByEmployee[es.employeeId][es.skillId] = delta;
    }

    return { requiredSkills, gapsByEmployee };
  }

  async getByEmployee(employeeId: string) {
    return this.prisma.unscopedClient.employeeSkill.findMany({
      where: { employeeId },
      include: { skill: true },
    });
  }
}
