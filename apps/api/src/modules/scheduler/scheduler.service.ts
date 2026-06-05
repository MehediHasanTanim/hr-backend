import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@hr/prisma';
import { LeaveAccrualEngine } from '../leave/services/leave-accrual.engine';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LeaveAccrualEngine) private readonly accrualEngine: LeaveAccrualEngine,
  ) {}

  /**
   * Run on the 1st of each month at 00:05 UTC.
   * Credits accrual for the current month.
   */
  @Cron('5 0 1 * *')
  async handleMonthlyLeaveAccrual(): Promise<void> {
    const now = new Date();
    const month = now.getUTCMonth() + 1; // 1-12
    const year = now.getUTCFullYear();

    this.logger.log({ month, year }, 'Starting monthly leave accrual run');

    const companies = await this.prisma.unscopedClient.company.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });

    let processed = 0;
    let failed = 0;

    for (const company of companies) {
      try {
        await this.accrualEngine.runForCompany(company.id, month, year);
        processed++;
      } catch (err) {
        failed++;
        this.logger.error(
          { companyId: company.id, month, year, err },
          'Monthly accrual failed for company',
        );
      }
    }

    this.logger.log({ processed, failed, total: companies.length }, 'Monthly leave accrual completed');
  }
}
