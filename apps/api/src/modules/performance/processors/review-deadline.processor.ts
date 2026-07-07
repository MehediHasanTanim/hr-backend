import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bullmq';
import { PrismaService } from '@hr/prisma';
import { QUEUE_NAMES } from '../../../common/queues.constants';

@Injectable()
@Processor(QUEUE_NAMES.REVIEW_DEADLINE_CHECK)
export class ReviewDeadlineProcessor {
  private readonly logger = new Logger(ReviewDeadlineProcessor.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Process()
  async handle() {
    const today = new Date();
    const cycles = await this.prisma.unscopedClient.reviewCycle.findMany({
      where: { status: 'ACTIVE', OR: [{ selfReviewDeadline: { lte: today } }, { managerReviewDeadline: { lte: today } }] },
    });
    if (cycles.length > 0) {
      this.logger.log(`Found ${cycles.length} cycles with overdue deadlines`);
    }
  }
}
