import { Inject, Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { round2dp } from '../../payroll/utils/round2dp';
import type { SchedulePanelDto, AssignPanelistsDto, SubmitScorecardDto, CancelPanelDto } from '../dto/interview.dto';

/** Weighted rubric for computing overall scorecard scores. Must sum to 1.0. */
export const SCORECARD_WEIGHTS = {
  technical: 0.5,
  communication: 0.25,
  cultureFit: 0.25,
} as const;

/** Compute weighted overall score from a scorecard's sub-scores via round2dp. */
export function computeOverallScore(dto: {
  technicalScore?: number | null;
  communicationScore?: number | null;
  cultureFitScore?: number | null;
}): number | null {
  const { technicalScore, communicationScore, cultureFitScore } = dto;
  if (technicalScore == null && communicationScore == null && cultureFitScore == null) return null;

  let weighted = 0;
  let totalWeight = 0;

  if (technicalScore != null) { weighted += technicalScore * SCORECARD_WEIGHTS.technical; totalWeight += SCORECARD_WEIGHTS.technical; }
  if (communicationScore != null) { weighted += communicationScore * SCORECARD_WEIGHTS.communication; totalWeight += SCORECARD_WEIGHTS.communication; }
  if (cultureFitScore != null) { weighted += cultureFitScore * SCORECARD_WEIGHTS.cultureFit; totalWeight += SCORECARD_WEIGHTS.cultureFit; }

  return totalWeight > 0 ? round2dp(weighted / totalWeight) : null;
}

@Injectable()
export class InterviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async schedulePanel(applicationId: string, dto: SchedulePanelDto, createdById: string): Promise<unknown> {
    const app = await this.prisma.unscopedClient.application.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('Application not found');

    if (dto.autoAdvanceStage && app.stage === 'SCREENING') {
      await this.prisma.unscopedClient.application.update({
        where: { id: applicationId },
        data: { stage: 'INTERVIEW', lastStageChangeAt: new Date() },
      });
    } else if (app.stage !== 'INTERVIEW') {
      throw new BadRequestException('Application must be in INTERVIEW stage');
    }

    // Validate at least one lead
    if (!dto.panelistEmployeeIds.includes(dto.leadEmployeeId)) {
      throw new BadRequestException('Lead must be in panelist list');
    }

    const panel = await this.prisma.unscopedClient.interviewPanel.create({
      data: {
        applicationId,
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes: dto.durationMinutes,
        mode: dto.mode,
        locationOrLink: dto.locationOrLink,
        createdById,
      },
    });

    // Create panelist entries
    for (const empId of dto.panelistEmployeeIds) {
      await this.prisma.unscopedClient.interviewPanelist.create({
        data: {
          interviewPanelId: panel.id,
          employeeId: empId,
          role: empId === dto.leadEmployeeId ? 'LEAD' : 'PANELIST',
        },
      });
    }

    this.events.emit('interview.scheduled', { panelId: panel.id, applicationId });
    this.audit.logAsync({
      companyId: '',
      entityType: 'interview_panel',
      entityId: panel.id,
      action: 'INTERVIEW_SCHEDULED',
    });

    return panel;
  }

  async assignPanelists(panelId: string, dto: AssignPanelistsDto): Promise<void> {
    const panel = await this.prisma.unscopedClient.interviewPanel.findUnique({ where: { id: panelId } });
    if (!panel) throw new NotFoundException('Panel not found');
    if (panel.status === 'COMPLETED') throw new BadRequestException('Cannot modify completed panel');

    // Remove existing panelists
    await this.prisma.unscopedClient.interviewPanelist.deleteMany({ where: { interviewPanelId: panelId } });

    // Add new panelists
    for (const empId of dto.employeeIds) {
      await this.prisma.unscopedClient.interviewPanelist.create({
        data: { interviewPanelId: panelId, employeeId: empId, role: 'PANELIST' },
      });
    }
  }

  async submitScorecard(panelId: string, panelistEmployeeId: string, dto: SubmitScorecardDto): Promise<unknown> {
    const panel = await this.prisma.unscopedClient.interviewPanel.findUnique({
      where: { id: panelId },
      include: { panelists: true, scorecards: true },
    });
    if (!panel) throw new NotFoundException('Panel not found');

    const isPanelist = panel.panelists.some((p) => p.employeeId === panelistEmployeeId);
    if (!isPanelist) throw new ForbiddenException('You are not assigned to this panel');

    const scorecard = await this.prisma.unscopedClient.interviewScorecard.upsert({
      where: { interviewPanelId_panelistEmployeeId: { interviewPanelId: panelId, panelistEmployeeId } },
      create: {
        interviewPanelId: panelId,
        panelistEmployeeId,
        recommendation: dto.recommendation,
        technicalScore: dto.technicalScore,
        communicationScore: dto.communicationScore,
        cultureFitScore: dto.cultureFitScore,
        notes: dto.notes,
        submittedAt: new Date(),
      },
      update: {
        recommendation: dto.recommendation,
        technicalScore: dto.technicalScore,
        communicationScore: dto.communicationScore,
        cultureFitScore: dto.cultureFitScore,
        notes: dto.notes,
        submittedAt: new Date(),
      },
    });

    // Check if all panelists submitted → auto-complete panel
    const submittedCount = await this.prisma.unscopedClient.interviewScorecard.count({
      where: { interviewPanelId: panelId, submittedAt: { not: null } },
    });
    if (submittedCount >= panel.panelists.length) {
      await this.prisma.unscopedClient.interviewPanel.update({
        where: { id: panelId },
        data: { status: 'COMPLETED' },
      });
    }

    this.events.emit('interview.scorecard_submitted', { panelId, applicationId: panel.applicationId });
    return scorecard;
  }

  async cancelPanel(panelId: string, dto: CancelPanelDto): Promise<unknown> {
    const panel = await this.prisma.unscopedClient.interviewPanel.findUnique({ where: { id: panelId } });
    if (!panel) throw new NotFoundException('Panel not found');
    if (panel.status === 'COMPLETED') throw new BadRequestException('Cannot cancel completed panel');

    const updated = await this.prisma.unscopedClient.interviewPanel.update({
      where: { id: panelId },
      data: { status: 'CANCELLED' },
    });

    this.events.emit('interview.cancelled', { panelId, reason: dto.reason });
    return updated;
  }

  async findByApplication(applicationId: string): Promise<unknown> {
    return this.prisma.unscopedClient.interviewPanel.findMany({
      where: { applicationId },
      include: { panelists: true, scorecards: true },
      orderBy: { scheduledAt: 'desc' },
    });
  }
}
