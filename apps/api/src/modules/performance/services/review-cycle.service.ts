import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ReviewCycleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async createCycle(dto: { name: string; cycleType: string; selfReviewDeadline: string; managerReviewDeadline: string; startDate: string; endDate: string }) {
    return this.prisma.unscopedClient.reviewCycle.create({ data: { ...dto, selfReviewDeadline: new Date(dto.selfReviewDeadline), managerReviewDeadline: new Date(dto.managerReviewDeadline), startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) } });
  }

  async activateCycle(cycleId: string, activatedBy: string) {
    const cycle = await this.prisma.unscopedClient.reviewCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (cycle.status !== 'DRAFT') throw new BadRequestException('Only draft cycles can be activated');

    const result = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const updated = await tx.reviewCycle.update({ where: { id: cycleId }, data: { status: 'ACTIVE', activatedAt: new Date(), activatedBy } });

      // Fan-out: create PerformanceReview for all active employees
      const employees = await tx.employee.findMany({ where: { status: 'ACTIVE' }, select: { id: true, managerId: true } });
      for (const emp of employees) {
        await tx.reviewInstance.create({ data: { cycleId, employeeId: emp.id, managerId: emp.managerId ?? activatedBy } });
      }

      return { ...updated, employeeCount: employees.length };
    });

    this.events.emit('review_cycle.activated', { cycleId, employeeCount: (result as any).employeeCount });
    this.audit.logAsync({ companyId: '', entityType: 'review_cycle', entityId: cycleId, action: 'REVIEW_CYCLE_ACTIVATED', newValue: { cycleId, employeeCount: (result as any).employeeCount } });
    return result;
  }

  async closeCycle(cycleId: string, closedBy: string) {
    const cycle = await this.prisma.unscopedClient.reviewCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (cycle.status !== 'ACTIVE') throw new BadRequestException('Only active cycles can be closed');

    const updated = await this.prisma.unscopedClient.reviewCycle.update({ where: { id: cycleId }, data: { status: 'CLOSED', closedAt: new Date(), closedBy } });
    this.events.emit('review_cycle.closed', { cycleId });
    this.audit.logAsync({ companyId: '', entityType: 'review_cycle', entityId: cycleId, action: 'REVIEW_CYCLE_CLOSED', newValue: { cycleId } });
    return updated;
  }

  async findAll() { return this.prisma.unscopedClient.reviewCycle.findMany({ orderBy: { createdAt: 'desc' } }); }
  async findById(id: string) { const c = await this.prisma.unscopedClient.reviewCycle.findUnique({ where: { id } }); if (!c) throw new NotFoundException('Cycle not found'); return c; }
}
