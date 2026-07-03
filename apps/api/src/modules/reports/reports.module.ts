import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../../common/queues.constants';
import { AuditModule } from '../../audit/audit.module';
import { ReportsController } from './reports.controller';
import { ReportQueryService } from './services/report-query.service';
import { SavedReportService } from './services/saved-report.service';
import { ReportScheduleService } from './services/report-schedule.service';
import { ReportExportProcessor } from './workers/report-export.processor';
import { ScheduleDispatcherProcessor } from './workers/schedule-dispatcher.processor';

@Module({
  imports: [
    AuditModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.REPORT_EXPORT },
      { name: QUEUE_NAMES.SCHEDULE_DISPATCHER },
    ),
  ],
  controllers: [ReportsController],
  providers: [
    ReportQueryService,
    SavedReportService,
    ReportScheduleService,
    ReportExportProcessor,
    ScheduleDispatcherProcessor,
  ],
  exports: [ReportQueryService, SavedReportService],
})
export class ReportsModule implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUE_NAMES.SCHEDULE_DISPATCHER)
    private readonly schedulerQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.schedulerQueue.add('tick', {}, {
      repeat: { every: 60_000 },
      jobId: 'schedule-dispatcher-tick',
    });
  }
}
