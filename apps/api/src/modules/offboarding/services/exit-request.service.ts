import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../audit/audit.service';

const EXIT_REQUEST_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ['PENDING_MANAGER_APPROVAL', 'APPROVED', 'CANCELLED'],
  PENDING_MANAGER_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['INTERVIEW_SCHEDULED', 'CHECKLIST_IN_PROGRESS', 'CANCELLED'],
  INTERVIEW_SCHEDULED: ['CHECKLIST_IN_PROGRESS'],
  CHECKLIST_IN_PROGRESS: ['COMPLETED'],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};

const OFFBOARDING_CHECKLIST_TEMPLATES: Record<string, Array<{ taskName: string; category: string; sortOrder: number }>> = {
  RESIGNATION: [
    { taskName: 'Knowledge Transfer', category: 'MANAGER', sortOrder: 1 },
    { taskName: 'Revoke System Access', category: 'IT', sortOrder: 2 },
    { taskName: 'Collect Assets', category: 'IT', sortOrder: 3 },
    { taskName: 'Final Payroll Processing', category: 'FINANCE', sortOrder: 4 },
    { taskName: 'Benefits COBRA Notification', category: 'FINANCE', sortOrder: 5 },
    { taskName: 'Exit Documents', category: 'HR', sortOrder: 6 },
    { taskName: 'Return Badge', category: 'FACILITIES', sortOrder: 7 },
    { taskName: 'Clear Locker', category: 'FACILITIES', sortOrder: 8 },
  ],
  TERMINATION: [
    { taskName: 'Revoke System Access', category: 'IT', sortOrder: 1 },
    { taskName: 'Collect Assets', category: 'IT', sortOrder: 2 },
    { taskName: 'Final Payroll', category: 'FINANCE', sortOrder: 3 },
    { taskName: 'Return Badge', category: 'FACILITIES', sortOrder: 4 },
  ],
  RETIREMENT: [
    { taskName: 'Knowledge Transfer', category: 'MANAGER', sortOrder: 1 },
    { taskName: 'Revoke System Access', category: 'IT', sortOrder: 2 },
    { taskName: 'Final Payroll', category: 'FINANCE', sortOrder: 3 },
    { taskName: 'Exit Documents', category: 'HR', sortOrder: 4 },
  ],
};

@Injectable()
export class ExitRequestService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async submit(dto: {
    companyId: string; employeeId: string; reasonType: string;
    reasonNotes?: string; requestedLastWorkingDay: Date; submittedById: string;
  }) {
    const today = new Date();
    if (new Date(dto.requestedLastWorkingDay) < today) throw new BadRequestException('Last working day must be in the future');

    const needsApproval = dto.reasonType === 'RESIGNATION';
    return this.prisma.unscopedClient.exitRequest.create({
      data: {
        companyId: dto.companyId, employeeId: dto.employeeId,
        reasonType: dto.reasonType as any, reasonNotes: dto.reasonNotes,
        requestedLastWorkingDay: new Date(dto.requestedLastWorkingDay),
        status: needsApproval ? 'PENDING_MANAGER_APPROVAL' : 'SUBMITTED',
        submittedById: dto.submittedById,
      },
    });
  }

  async approve(id: string, approverId: string, approvedLastWorkingDay?: Date) {
    const exit = await this.prisma.unscopedClient.exitRequest.findUnique({ where: { id } });
    if (!exit) throw new NotFoundException('Exit request not found');
    this.assertTransition(exit.status, 'APPROVED');

    const effectiveDate = approvedLastWorkingDay ?? exit.requestedLastWorkingDay;
    const template = OFFBOARDING_CHECKLIST_TEMPLATES[exit.reasonType] ?? OFFBOARDING_CHECKLIST_TEMPLATES['RESIGNATION'];

    const updated = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const result = await tx.exitRequest.update({
        where: { id },
        data: {
          status: 'APPROVED', approvedById: approverId, approvedAt: new Date(),
          approvedLastWorkingDay: effectiveDate,
        },
      });

      // Materialize checklist from template
      for (const task of template) {
        await tx.offboardingChecklistTask.create({
          data: {
            exitRequestId: id, taskName: task.taskName,
            category: task.category as any, sortOrder: task.sortOrder,
          },
        });
      }

      return result;
    });

    this.events.emit('employee.exit_approved', { exitRequestId: id, employeeId: exit.employeeId, reasonType: exit.reasonType });
    this.audit.logAsync({ companyId: exit.companyId, entityType: 'ExitRequest', entityId: id, action: 'EXIT_REQUEST_APPROVED', newValue: { approvedById: approverId } });

    return updated;
  }

  async reject(id: string, approverId: string, rejectionReason: string) {
    const exit = await this.prisma.unscopedClient.exitRequest.findUnique({ where: { id } });
    if (!exit) throw new NotFoundException('Exit request not found');
    this.assertTransition(exit.status, 'REJECTED');

    return this.prisma.unscopedClient.exitRequest.update({
      where: { id }, data: { status: 'REJECTED', rejectionReason },
    });
  }

  async cancel(id: string) {
    const exit = await this.prisma.unscopedClient.exitRequest.findUnique({ where: { id } });
    if (!exit) throw new NotFoundException('Exit request not found');
    this.assertTransition(exit.status, 'CANCELLED');

    return this.prisma.unscopedClient.exitRequest.update({
      where: { id }, data: { status: 'CANCELLED' },
    });
  }

  async finalizeExit(id: string) {
    const exit = await this.prisma.unscopedClient.exitRequest.findUnique({
      where: { id }, include: { checklistTasks: true, interview: true },
    });
    if (!exit) throw new NotFoundException('Exit request not found');
    if (exit.status === 'COMPLETED') return exit; // Idempotency guard

    const allTasksDone = exit.checklistTasks.every(t => ['COMPLETED', 'SKIPPED'].includes(t.status));
    const interviewDone = exit.interview?.isCompleted ?? false;

    if (!allTasksDone || !interviewDone) throw new BadRequestException('All checklist tasks must be done and interview completed');

    await this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.exitRequest.update({ where: { id }, data: { status: 'COMPLETED' } });
      // In production: update Employee.status = TERMINATED, deactivate sessions
    });

    this.events.emit('employee.terminated', { employeeId: exit.employeeId, exitRequestId: id, terminationDate: new Date().toISOString(), reasonType: exit.reasonType });
    this.audit.logAsync({ companyId: exit.companyId, entityType: 'ExitRequest', entityId: id, action: 'EMPLOYEE_TERMINATED', newValue: { employeeId: exit.employeeId } });
  }

  private assertTransition(currentStatus: string, targetStatus: string) {
    const allowed = EXIT_REQUEST_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new BadRequestException(`Cannot transition from ${currentStatus} to ${targetStatus}`);
    }
  }

  async getById(id: string) {
    const r = await this.prisma.unscopedClient.exitRequest.findUnique({
      where: { id }, include: { checklistTasks: true, interview: true },
    });
    if (!r) throw new NotFoundException('Exit request not found');
    return r;
  }

  async list(companyId: string) {
    return this.prisma.unscopedClient.exitRequest.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }
}
