import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@hr/prisma';
import { QUEUE_NAMES } from '../../../../common/queues.constants';
import { AuditService } from '../../../audit/audit.service';
import { ExportFormat } from '../enums/export-format.enum';
import type { CreateReportScheduleDto } from '../dto/create-report-schedule.dto';
import type { ReportSchedule, Prisma } from '@prisma/client';

const CRON_REGEX =
  /^(\*|([0-9]|[1-5][0-9])) (\*|([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|[12][0-9]|3[01])) (\*|([1-9]|1[0-2])) (\*|([0-6]))$/;

export interface ReportExportJobPayload {
  savedReportId: string;
  format: ExportFormat;
  recipientId?: string;
  triggeredAt: string;
}

@Injectable()
export class ReportScheduleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditLogService: AuditService,
    @InjectQueue(QUEUE_NAMES.REPORT_EXPORT)
    private readonly reportExportQueue: Queue<ReportExportJobPayload>,
  ) {}

  async create(
    dto: CreateReportScheduleDto,
    actorId: string,
  ): Promise<ReportSchedule> {
    // Validate cron expression
    if (!CRON_REGEX.test(dto.cronExpression)) {
      throw new BadRequestException('Invalid cron expression');
    }

    const schedule = await this.prisma.unscopedClient.reportSchedule.create({
      data: {
        savedReportId: dto.savedReportId,
        cronExpression: dto.cronExpression,
        format: dto.format,
        recipientId: dto.recipientId ?? null,
      },
    });

    return schedule;
  }

  async list(actorId: string): Promise<ReportSchedule[]> {
    return this.prisma.unscopedClient.reportSchedule.findMany({
      where: {
        savedReport: { createdById: actorId },
      },
      include: { savedReport: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggleActive(id: string, actorId: string): Promise<ReportSchedule> {
    const schedule = await this.prisma.unscopedClient.reportSchedule.findUnique({
      where: { id },
      include: { savedReport: true },
    });

    if (!schedule) {
      throw new BadRequestException('Schedule not found');
    }

    return this.prisma.unscopedClient.reportSchedule.update({
      where: { id },
      data: { isActive: !schedule.isActive },
    });
  }

  async enqueueBySchedule(scheduleId: string): Promise<void> {
    const schedule = await this.prisma.unscopedClient.reportSchedule.findUnique({
      where: { id },
      include: { savedReport: true },
    });

    if (!schedule || !schedule.isActive) return;

    await this.reportExportQueue.add(QUEUE_NAMES.REPORT_EXPORT, {
      savedReportId: schedule.savedReportId,
      format: schedule.format,
      recipientId: schedule.recipientId ?? undefined,
      triggeredAt: new Date().toISOString(),
    });

    // Update lastRunAt and compute nextRunAt (naive: +1 hour from now)
    const now = new Date();
    const nextRunAt = new Date(now.getTime() + 60 * 60 * 1000);

    await this.prisma.unscopedClient.reportSchedule.update({
      where: { id },
      data: { lastRunAt: now, nextRunAt },
    });

    this.auditLogService.logAsync({
      companyId: '',
      entityType: 'report_schedule',
      entityId: scheduleId,
      action: 'REPORT_SCHEDULE_TRIGGERED',
      newValue: this.auditLogService.stripPii({
        savedReportId: schedule.savedReportId,
      }) as Prisma.InputJsonValue,
    });
  }

  async findDueSchedules(): Promise<ReportSchedule[]> {
    const now = new Date();

    return this.prisma.unscopedClient.reportSchedule.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
      include: { savedReport: true },
    });
  }
}
