import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../../../../common/queues.constants';
import { ReportScheduleService } from '../services/report-schedule.service';

@Injectable()
@Processor(QUEUE_NAMES.SCHEDULE_DISPATCHER)
export class ScheduleDispatcherProcessor {
  private readonly logger = new Logger(ScheduleDispatcherProcessor.name);

  constructor(
    @Inject(ReportScheduleService)
    private readonly reportScheduleService: ReportScheduleService,
  ) {}

  @Process('tick')
  async tick(): Promise<void> {
    this.logger.log('Schedule dispatcher tick: checking for due schedules');

    const due = await this.reportScheduleService.findDueSchedules();

    if (due.length === 0) {
      this.logger.log('No due schedules found');
      return;
    }

    this.logger.log(`Found ${due.length} due schedule(s), enqueuing...`);

    const results = await Promise.allSettled(
      due.map((s) => this.reportScheduleService.enqueueBySchedule(s.id)),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.error(
        `${failed.length} schedule(s) failed to enqueue`,
        failed.map((f) => (f as PromiseRejectedResult).reason),
      );
    }
  }
}
