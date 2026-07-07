import { Inject, Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class OnboardingAssignmentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async assignTemplateToEmployee(employeeId: string, templateId: string, hireDate: Date, assignedBy: string) {
    const template = await this.prisma.unscopedClient.onboardingTemplate.findUnique({
      where: { id: templateId }, include: { tasks: true },
    });
    if (!template) throw new NotFoundException('Template not found');
    if (template.status !== 'ACTIVE') throw new BadRequestException('Template must be active');

    const existing = await this.prisma.unscopedClient.employeeOnboarding.findUnique({
      where: { employeeId_templateId_hireDate: { employeeId, templateId, hireDate } },
    });
    if (existing) throw new ConflictException('Employee already assigned this template for this hire date');

    const result = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const onboarding = await tx.employeeOnboarding.create({
        data: { employeeId, templateId, hireDate, assignedBy },
      });

      const taskInstances = template.tasks.map((task) => ({
        employeeOnboardingId: onboarding.id,
        templateTaskId: task.id,
        title: task.title,
        description: task.description,
        category: task.category,
        assigneeRole: task.assigneeRole,
        dueDate: new Date(hireDate.getTime() + task.dueDayOffset * 86400000),
      }));

      for (const ti of taskInstances) {
        await tx.onboardingTaskInstance.create({ data: ti });
      }

      return onboarding;
    });

    this.events.emit('onboarding.assigned', { employeeId, templateId, taskCount: template.tasks.length });
    this.audit.logAsync({ companyId: '', entityType: 'employee_onboarding', entityId: result.id, action: 'ONBOARDING_ASSIGNED', newValue: { employeeId, templateId, taskCount: template.tasks.length } });

    return result;
  }

  async completeTask(taskInstanceId: string, completedBy: string) {
    const task = await this.prisma.unscopedClient.onboardingTaskInstance.findUnique({ where: { id: taskInstanceId } });
    if (!task) throw new NotFoundException('Task not found');
    if (!['PENDING', 'IN_PROGRESS'].includes(task.status)) throw new BadRequestException('Task already completed or skipped');

    await this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.onboardingTaskInstance.update({ where: { id: taskInstanceId }, data: { status: 'COMPLETED', completedBy, completedAt: new Date() } });

      const pending = await tx.onboardingTaskInstance.count({
        where: { employeeOnboardingId: task.employeeOnboardingId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      });
      if (pending === 0) {
        await tx.employeeOnboarding.update({ where: { id: task.employeeOnboardingId }, data: { status: 'COMPLETED', completedAt: new Date() } });
        this.events.emit('onboarding.completed', { employeeOnboardingId: task.employeeOnboardingId });
      }
    });
  }

  async cancelOnboarding(employeeOnboardingId: string, reason: string) {
    const onboarding = await this.prisma.unscopedClient.employeeOnboarding.findUnique({ where: { id: employeeOnboardingId } });
    if (!onboarding) throw new NotFoundException('Onboarding not found');

    await this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.employeeOnboarding.update({ where: { id: employeeOnboardingId }, data: { status: 'CANCELLED' } });
      await tx.onboardingTaskInstance.updateMany({
        where: { employeeOnboardingId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        data: { status: 'SKIPPED' },
      });
    });
  }

  async findByEmployee(employeeId: string) {
    return this.prisma.unscopedClient.employeeOnboarding.findMany({
      where: { employeeId }, include: { taskInstances: true }, orderBy: { createdAt: 'desc' },
    });
  }
}
