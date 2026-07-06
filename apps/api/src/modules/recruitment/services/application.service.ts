import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { round2dp } from '../../payroll/utils/round2dp';
import type { Prisma } from '@prisma/client';

type ApplicationStage = 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';

const VALID_TRANSITIONS: Record<string, ApplicationStage[]> = {
  APPLIED: ['SCREENING', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['HIRED', 'REJECTED', 'WITHDRAWN'],
  HIRED: [], // terminal
  REJECTED: [], // terminal
  WITHDRAWN: [], // terminal
};

@Injectable()
export class ApplicationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async moveStage(applicationId: string, targetStage: ApplicationStage, actorId: string): Promise<unknown> {
    const app = await this.prisma.unscopedClient.application.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('Application not found');

    const allowed = VALID_TRANSITIONS[app.stage] ?? [];
    if (!allowed.includes(targetStage)) {
      throw new BadRequestException(`Cannot move from ${app.stage} to ${targetStage}`);
    }

    if (targetStage === 'HIRED') {
      throw new BadRequestException('Cannot directly set HIRED stage — use offer acceptance flow');
    }

    const priorStage = app.stage;
    const updated = await this.prisma.unscopedClient.application.update({
      where: { id: applicationId },
      data: {
        stage: targetStage,
        lastStageChangeAt: new Date(),
      },
    });

    this.events.emit('application.stage_changed', { applicationId, priorStage, newStage: targetStage });
    this.audit.logAsync({
      companyId: '',
      entityType: 'application',
      entityId: applicationId,
      action: 'APPLICATION_STAGE_MOVED',
      newValue: this.audit.stripPii({ priorStage, newStage: targetStage }),
    });

    return updated;
  }

  async reject(applicationId: string, reason: string, actorId: string): Promise<unknown> {
    const app = await this.prisma.unscopedClient.application.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('Application not found');
    if (['HIRED', 'REJECTED'].includes(app.stage)) throw new BadRequestException('Application already closed');

    const updated = await this.prisma.unscopedClient.application.update({
      where: { id: applicationId },
      data: { stage: 'REJECTED', rejectionReason: reason, rejectedById: actorId, lastStageChangeAt: new Date() },
    });

    this.events.emit('application.rejected', { applicationId, reason });
    this.audit.logAsync({
      companyId: '',
      entityType: 'application',
      entityId: applicationId,
      action: 'APPLICATION_REJECTED',
      newValue: this.audit.stripPii({ reason }),
    });

    return updated;
  }

  async updateScore(applicationId: string): Promise<void> {
    const scorecards = await this.prisma.unscopedClient.interviewScorecard.findMany({
      where: { panel: { applicationId } },
      select: { technicalScore: true, communicationScore: true, cultureFitScore: true },
    });

    const scores: number[] = [];
    for (const sc of scorecards) {
      if (sc.technicalScore) scores.push(Number(sc.technicalScore));
      if (sc.communicationScore) scores.push(Number(sc.communicationScore));
      if (sc.cultureFitScore) scores.push(Number(sc.cultureFitScore));
    }

    const avg = scores.length > 0 ? round2dp(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    await this.prisma.unscopedClient.application.update({
      where: { id: applicationId },
      data: { score: avg },
    });
  }

  async findById(id: string): Promise<unknown> {
    const app = await this.prisma.unscopedClient.application.findUnique({
      where: { id },
      include: { candidate: true, requisition: true },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  async findAll(requisitionId?: string, stage?: string, page = 1, limit = 20): Promise<unknown> {
    const where: Record<string, unknown> = {};
    if (requisitionId) where.requisitionId = requisitionId;
    if (stage) where.stage = stage;

    return this.prisma.unscopedClient.application.findMany({
      where: where as any,
      include: { candidate: true },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async hireApplication(applicationId: string, tx?: Prisma.TransactionClient): Promise<unknown> {
    const client = tx ?? this.prisma.unscopedClient;
    return client.application.update({
      where: { id: applicationId },
      data: { stage: 'HIRED', lastStageChangeAt: new Date() },
    });
  }
}
