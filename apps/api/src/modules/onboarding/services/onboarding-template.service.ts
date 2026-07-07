import { Inject, Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';

@Injectable()
export class OnboardingTemplateService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createTemplate(dto: { name: string; role?: string; description?: string; createdBy: string }) {
    return this.prisma.unscopedClient.onboardingTemplate.create({ data: dto });
  }

  async updateTemplate(id: string, dto: { name?: string; role?: string; description?: string }) {
    const t = await this.prisma.unscopedClient.onboardingTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Template not found');
    if (t.status === 'ARCHIVED') throw new BadRequestException('Cannot edit archived template');
    return this.prisma.unscopedClient.onboardingTemplate.update({ where: { id }, data: dto });
  }

  async archiveTemplate(id: string) {
    return this.prisma.unscopedClient.onboardingTemplate.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async addTask(templateId: string, dto: { title: string; description?: string; category: string; dueDayOffset: number; assigneeRole: string }) {
    const t = await this.prisma.unscopedClient.onboardingTemplate.findUnique({ where: { id: templateId } });
    if (!t) throw new NotFoundException('Template not found');
    if (t.status === 'ARCHIVED') throw new BadRequestException('Cannot edit archived template');
    if (dto.dueDayOffset < 0) throw new BadRequestException('dueDayOffset must be >= 0');
    return this.prisma.unscopedClient.onboardingTemplateTask.create({ data: { ...dto, templateId } });
  }

  async removeTask(taskId: string) { await this.prisma.unscopedClient.onboardingTemplateTask.delete({ where: { id: taskId } }); }

  async reorderTasks(templateId: string, orderedTaskIds: string[]) {
    for (let i = 0; i < orderedTaskIds.length; i++) {
      await this.prisma.unscopedClient.onboardingTemplateTask.update({ where: { id: orderedTaskIds[i] }, data: { sortOrder: i } });
    }
  }

  async findById(id: string) {
    const t = await this.prisma.unscopedClient.onboardingTemplate.findUnique({ where: { id }, include: { tasks: { orderBy: { sortOrder: 'asc' } } } });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  async findAll() { return this.prisma.unscopedClient.onboardingTemplate.findMany({ orderBy: { createdAt: 'desc' } }); }
}
