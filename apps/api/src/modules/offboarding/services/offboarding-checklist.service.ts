import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class OffboardingChecklistService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async completeTask(id: string, completedById: string, notes?: string) {
    const task = await this.prisma.unscopedClient.offboardingChecklistTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Checklist task not found');
    if (task.status === 'COMPLETED') throw new BadRequestException('Task already completed');

    const result = await this.prisma.unscopedClient.offboardingChecklistTask.update({
      where: { id },
      data: { status: 'COMPLETED', completedById, completedAt: new Date(), notes },
    });

    this.audit.logAsync({ companyId: '', entityType: 'OffboardingChecklistTask', entityId: id, action: 'CHECKLIST_TASK_COMPLETED', newValue: { completedById } });

    // Transition ExitRequest to CHECKLIST_IN_PROGRESS if needed
    await this.maybeTransitionExitStatus(task.exitRequestId);

    return result;
  }

  async skipTask(id: string, skippedById: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('Skip reason is required');

    const task = await this.prisma.unscopedClient.offboardingChecklistTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Checklist task not found');

    const result = await this.prisma.unscopedClient.offboardingChecklistTask.update({
      where: { id },
      data: { status: 'SKIPPED', completedById: skippedById, completedAt: new Date(), notes: reason },
    });

    this.audit.logAsync({ companyId: '', entityType: 'OffboardingChecklistTask', entityId: id, action: 'CHECKLIST_TASK_COMPLETED', newValue: { completedById: skippedById, skipped: true } });

    await this.maybeTransitionExitStatus(task.exitRequestId);

    return result;
  }

  private async maybeTransitionExitStatus(exitRequestId: string) {
    const exit = await this.prisma.unscopedClient.exitRequest.findUnique({
      where: { id: exitRequestId },
      include: { checklistTasks: true },
    });
    if (!exit) return;

    if (['APPROVED', 'INTERVIEW_SCHEDULED'].includes(exit.status)) {
      // Any task move from PENDING → moves to CHECKLIST_IN_PROGRESS
      const hasInProgressTask = exit.checklistTasks.some(t => !['PENDING'].includes(t.status));
      if (hasInProgressTask) {
        await this.prisma.unscopedClient.exitRequest.update({
          where: { id: exitRequestId },
          data: { status: 'CHECKLIST_IN_PROGRESS' },
        });
      }
    }
  }

  async getByExitRequest(exitRequestId: string) {
    return this.prisma.unscopedClient.offboardingChecklistTask.findMany({
      where: { exitRequestId }, orderBy: { sortOrder: 'asc' },
    });
  }
}
