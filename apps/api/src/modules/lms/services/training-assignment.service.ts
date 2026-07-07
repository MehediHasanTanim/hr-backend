import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../audit/audit.service';
import { QUEUE_NAMES } from '../../../common/queues.constants';

@Injectable()
export class TrainingAssignmentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async bulkAssign(dto: {
    companyId: string; targetType: string; targetId: string;
    scopeType: string; scopeFilter: Record<string, unknown>;
    deadlineAt: Date; isMandatory: boolean;
    reminderScheduleDaysBeforeDeadline: number[]; assignedById: string;
  }) {
    // Resolve target employee IDs based on scopeType + scopeFilter
    const employeeIds = await this.resolveEmployeeIds(dto.scopeType, dto.scopeFilter, dto.companyId);

    const BATCH_SIZE = 500;
    let createdCount = 0;

    for (let i = 0; i < employeeIds.length; i += BATCH_SIZE) {
      const batch = employeeIds.slice(i, i + BATCH_SIZE);
      await this.prisma.unscopedClient.$transaction(async (tx) => {
        const assignment = await tx.trainingAssignment.create({
          data: {
            companyId: dto.companyId,
            targetType: dto.targetType as any,
            targetId: dto.targetId,
            scopeType: dto.scopeType as any,
            scopeFilter: dto.scopeFilter,
            deadlineAt: dto.deadlineAt,
            isMandatory: dto.isMandatory,
            reminderScheduleDaysBeforeDeadline: dto.reminderScheduleDaysBeforeDeadline,
            assignedById: dto.assignedById,
          },
        });

        for (const empId of batch) {
          const existing = await tx.courseEnrollment.findUnique({
            where: { courseId_employeeId: { courseId: dto.targetId, employeeId: empId } },
          });
          if (!existing) {
            await tx.courseEnrollment.create({
              data: { courseId: dto.targetId, employeeId: empId, assignmentId: assignment.id },
            });
            createdCount++;
          }
        }

        this.events.emit('training.assigned', { assignmentId: assignment.id, employeeIds: batch, courseId: dto.targetId });
      });
    }

    if (dto.isMandatory) {
      this.audit.logAsync({
        companyId: dto.companyId, entityType: 'TrainingAssignment', entityId: dto.targetId,
        action: 'MANDATORY_TRAINING_ASSIGNED',
        newValue: { scopeType: dto.scopeType, scopeFilter: dto.scopeFilter, targetId: dto.targetId, deadlineAt: dto.deadlineAt, affectedEmployeeCount: createdCount },
      });
    }

    return { affectedEmployeeCount: createdCount };
  }

  async scheduleDeadlineReminders(assignmentId: string) {
    const assignment = await this.prisma.unscopedClient.trainingAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment not found');

    // In production, this enqueues delayed BullMQ jobs. For now, emit events.
    const schedule = assignment.reminderScheduleDaysBeforeDeadline as number[];
    schedule.forEach((days) => {
      this.events.emit('training.deadline_reminder_scheduled', { assignmentId, daysBeforeDeadline: days });
    });
  }

  async getComplianceStatus(assignmentId: string) {
    const assignment = await this.prisma.unscopedClient.trainingAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const [completed, pending, overdue] = await Promise.all([
      this.prisma.unscopedClient.courseEnrollment.count({ where: { assignmentId, status: 'COMPLETED' } }),
      this.prisma.unscopedClient.courseEnrollment.count({ where: { assignmentId, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } } }),
      this.prisma.unscopedClient.courseEnrollment.count({ where: { assignmentId, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } } }), // overdue query would add deadline check
    ]);

    return { completed, pending, overdue };
  }

  private async resolveEmployeeIds(scopeType: string, scopeFilter: Record<string, unknown>, _companyId: string): Promise<string[]> {
    // Stub: In production, calls EmployeeService/DepartmentService
    // For ORG_WIDE, return an empty batch — real implementation would paginate
    if (scopeType === 'ORG_WIDE') return [];
    if (scopeType === 'EMPLOYEE' && Array.isArray(scopeFilter['employeeIds'])) {
      return scopeFilter['employeeIds'] as string[];
    }
    // DEPARTMENT and ROLE scopes would resolve via existing services
    return (scopeFilter['employeeIds'] as string[]) ?? [];
  }
}
