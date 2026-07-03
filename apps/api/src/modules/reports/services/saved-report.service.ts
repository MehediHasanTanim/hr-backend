import { Inject, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@hr/prisma';
import { QUEUE_NAMES } from '../../../../common/queues.constants';
import { AuditService } from '../../../audit/audit.service';
import { ExportFormat } from '../enums/export-format.enum';
import type { SaveReportDto } from '../dto/save-report.dto';
import type { TriggerExportDto } from '../dto/trigger-export.dto';
import type { ExportJobAcceptedDto } from '../dto/export-job-accepted.dto';
import type { SavedReport, Prisma } from '@prisma/client';

export interface ReportExportJobPayload {
  savedReportId: string;
  format: ExportFormat;
  recipientId?: string;
  triggeredAt: string;
}

@Injectable()
export class SavedReportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditLogService: AuditService,
    @InjectQueue(QUEUE_NAMES.REPORT_EXPORT)
    private readonly reportExportQueue: Queue<ReportExportJobPayload>,
  ) {}

  async save(dto: SaveReportDto, actorId: string): Promise<SavedReport> {
    const saved = await this.prisma.unscopedClient.savedReport.create({
      data: {
        name: dto.name,
        reportKey: dto.reportKey,
        parameters: dto.parameters as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });

    await this.auditLogService.logAsync({
      companyId: '', // will be populated by caller
      entityType: 'saved_report',
      entityId: saved.id,
      action: 'REPORT_DEFINITION_SAVED',
      newValue: this.auditLogService.stripPii({
        name: dto.name,
        reportKey: dto.reportKey,
      }) as Prisma.InputJsonValue,
    });

    return saved;
  }

  async list(actorId: string): Promise<SavedReport[]> {
    return this.prisma.unscopedClient.savedReport.findMany({
      where: { createdById: actorId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrFail(id: string, actorId: string): Promise<SavedReport> {
    const saved = await this.prisma.unscopedClient.savedReport.findUnique({
      where: { id },
    });

    if (!saved) {
      throw new NotFoundException('Saved report not found');
    }

    if (saved.createdById !== actorId) {
      throw new ForbiddenException('You can only access your own saved reports');
    }

    return saved;
  }

  async delete(id: string, actorId: string): Promise<void> {
    const saved = await this.findOneOrFail(id, actorId);

    // Delete associated schedules first
    await this.prisma.unscopedClient.reportSchedule.deleteMany({
      where: { savedReportId: saved.id },
    });

    await this.prisma.unscopedClient.savedReport.delete({
      where: { id: saved.id },
    });
  }

  async triggerExport(
    savedReportId: string,
    actorId: string,
    dto: TriggerExportDto,
  ): Promise<ExportJobAcceptedDto> {
    const saved = await this.findOneOrFail(savedReportId, actorId);

    const job = await this.reportExportQueue.add(QUEUE_NAMES.REPORT_EXPORT, {
      savedReportId: saved.id,
      format: dto.format,
      recipientId: dto.recipientId ?? actorId,
      triggeredAt: new Date().toISOString(),
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    this.auditLogService.logAsync({
      companyId: '',
      entityType: 'saved_report',
      entityId: savedReportId,
      action: 'REPORT_EXPORT_TRIGGERED',
      newValue: this.auditLogService.stripPii({
        format: dto.format,
        jobId: job.id,
      }) as Prisma.InputJsonValue,
    });

    return {
      jobId: String(job.id),
      message: 'Export queued. You will be notified when ready.',
    };
  }
}
