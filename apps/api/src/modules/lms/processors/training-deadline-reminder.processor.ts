import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class TrainingDeadlineReminderProcessor {
  private readonly logger = new Logger(TrainingDeadlineReminderProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async processDelayedReminder(assignmentId: string, employeeIds: string[]) {
    for (const empId of employeeIds) {
      const enrollment = await this.prisma.unscopedClient.courseEnrollment.findFirst({
        where: { assignmentId, employeeId: empId },
      });

      // Skip if already completed — avoid nagging finishers
      if (!enrollment || enrollment.status === 'COMPLETED') {
        this.logger.log(`Skipping reminder for employee ${empId} — already completed or not enrolled`);
        continue;
      }

      this.events.emit('training.deadline_reminder.sent', { assignmentId, employeeId: empId, enrollmentId: enrollment.id });
    }

    this.logger.log(`Deadline reminders processed for assignment ${assignmentId}`);
  }
}
