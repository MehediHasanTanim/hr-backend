import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bullmq';
import { PrismaService } from '@hr/prisma';
import { QUEUE_NAMES } from '../../../common/queues.constants';

@Injectable()
@Processor(QUEUE_NAMES.ONBOARDING_TASK_REMINDER)
export class OnboardingReminderProcessor {
  private readonly logger = new Logger(OnboardingReminderProcessor.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Process()
  async handle() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tasks = await this.prisma.unscopedClient.onboardingTaskInstance.findMany({
      where: { dueDate: { lte: today }, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    });
    if (tasks.length > 0) {
      this.logger.log(`Found ${tasks.length} overdue/pending onboarding tasks`);
    }
  }
}
