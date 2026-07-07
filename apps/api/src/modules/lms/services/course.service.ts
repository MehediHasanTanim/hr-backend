import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class CourseService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async createCourse(dto: {
    companyId: string; title: string; description?: string; format: string;
    externalUrl?: string; durationMinutes: number; isMandatory: boolean;
    skillIds: string[]; thumbnailKey?: string; createdById: string;
  }) {
    // Validate all skillIds exist and are ACTIVE
    if (dto.skillIds?.length) {
      const skills = await this.prisma.unscopedClient.skillTaxonomy.findMany({
        where: { id: { in: dto.skillIds }, status: 'ACTIVE' },
      });
      if (skills.length !== dto.skillIds.length) throw new BadRequestException('One or more skills not found or not ACTIVE');
    }

    return this.prisma.unscopedClient.course.create({
      data: {
        companyId: dto.companyId,
        title: dto.title,
        description: dto.description,
        thumbnailKey: dto.thumbnailKey,
        format: dto.format as any,
        externalUrl: dto.externalUrl,
        durationMinutes: dto.durationMinutes,
        isMandatory: dto.isMandatory,
        createdById: dto.createdById,
        skillTags: dto.skillIds?.length ? { create: dto.skillIds.map((sid: string) => ({ skillId: sid })) } : undefined,
      },
      include: { skillTags: true },
    });
  }

  async updateCourse(id: string, dto: {
    title?: string; description?: string; format?: string; externalUrl?: string;
    durationMinutes?: number; isMandatory?: boolean; status?: string; thumbnailKey?: string;
  }, actorId: string) {
    const course = await this.prisma.unscopedClient.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');

    // Status transition validation
    if (dto.status && dto.status !== course.status) {
      const validTransitions: Record<string, string[]> = {
        DRAFT: ['PUBLISHED'],
        PUBLISHED: ['ARCHIVED'],
        ARCHIVED: ['DRAFT'], // admin-only revert
      };
      if (!validTransitions[course.status]?.includes(dto.status)) {
        throw new BadRequestException(`Cannot transition from ${course.status} to ${dto.status}`);
      }
    }

    return this.prisma.unscopedClient.course.update({ where: { id }, data: dto });
  }

  async uploadThumbnail(courseId: string, s3Key: string) {
    const course = await this.prisma.unscopedClient.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    return this.prisma.unscopedClient.course.update({ where: { id: courseId }, data: { thumbnailKey: s3Key } });
  }

  async tagSkills(courseId: string, skillIds: string[]) {
    const course = await this.prisma.unscopedClient.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const skills = await this.prisma.unscopedClient.skillTaxonomy.findMany({
      where: { id: { in: skillIds }, status: 'ACTIVE' },
    });
    if (skills.length !== skillIds.length) throw new BadRequestException('One or more skills not found or not ACTIVE');

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.courseSkillTag.deleteMany({ where: { courseId } });
      for (const sid of skillIds) {
        await tx.courseSkillTag.create({ data: { courseId, skillId: sid } });
      }
      return tx.course.findUnique({ where: { id: courseId }, include: { skillTags: true } });
    });
  }

  async listCourses(filters: { companyId?: string; status?: string; format?: string }) {
    return this.prisma.unscopedClient.course.findMany({
      where: { ...filters },
      include: { skillTags: { include: { skill: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCourseById(id: string) {
    const c = await this.prisma.unscopedClient.course.findUnique({
      where: { id }, include: { skillTags: { include: { skill: true } }, pathCourses: true },
    });
    if (!c) throw new NotFoundException('Course not found');
    return c;
  }
}
