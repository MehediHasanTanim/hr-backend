import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class PipService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AuditService) private readonly audit: AuditService, @Inject(EventEmitter2) private readonly events: EventEmitter2) {}

  async initiatePip(dto: { employeeId: string; managerId: string; reason: string; goals: string; startDate: string; endDate: string }, initiatedBy: string) {
    const existing = await this.prisma.unscopedClient.performanceImprovementPlan.findFirst({ where: { employeeId: dto.employeeId, status: 'ACTIVE' } });
    if (existing) throw new BadRequestException('Employee already has an active PIP');

    const pip = await this.prisma.unscopedClient.performanceImprovementPlan.create({
      data: { ...dto, initiatedBy, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) },
    });

    this.events.emit('pip.initiated', { pipId: pip.id, employeeId: pip.employeeId });
    this.audit.logAsync({ companyId: '', entityType: 'performance_improvement_plan', entityId: pip.id, action: 'PIP_INITIATED', newValue: { employeeId: pip.employeeId, managerId: pip.managerId, startDate: dto.startDate, endDate: dto.endDate } });
    return pip;
  }

  async addCheckIn(pipId: string, dto: { postedBy: string; note: string; ratingAtCheckIn?: string; checkInDate: string }) {
    const pip = await this.prisma.unscopedClient.performanceImprovementPlan.findUnique({ where: { id: pipId } });
    if (!pip) throw new NotFoundException('PIP not found');
    if (pip.status !== 'ACTIVE') throw new BadRequestException('PIP is not active');
    return this.prisma.unscopedClient.pipCheckIn.create({ data: { ...dto, checkInDate: new Date(dto.checkInDate) } });
  }

  async closePip(pipId: string, dto: { outcome: string; outcomeNotes?: string }, closedBy: string) {
    const pip = await this.prisma.unscopedClient.performanceImprovementPlan.findUnique({ where: { id: pipId } });
    if (!pip) throw new NotFoundException('PIP not found');
    if (pip.status !== 'ACTIVE') throw new BadRequestException('PIP is not active');

    const updated = await this.prisma.unscopedClient.performanceImprovementPlan.update({
      where: { id: pipId }, data: { status: 'CLOSED', outcome: dto.outcome as any, outcomeNotes: dto.outcomeNotes, closedAt: new Date(), closedBy },
    });

    this.events.emit('pip.closed', { pipId, outcome: dto.outcome });
    this.audit.logAsync({ companyId: '', entityType: 'performance_improvement_plan', entityId: pipId, action: 'PIP_CLOSED', newValue: { pipId, outcome: dto.outcome } });
    return updated;
  }

  async findById(id: string) { const p = await this.prisma.unscopedClient.performanceImprovementPlan.findUnique({ where: { id }, include: { checkIns: true } }); if (!p) throw new NotFoundException('PIP not found'); return p; }
  async findByEmployee(employeeId: string) { return this.prisma.unscopedClient.performanceImprovementPlan.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' } }); }
}
