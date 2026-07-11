import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../../../common/queues.constants';
import { ReviewCycleService } from './services/review-cycle.service';
import { GoalService } from './services/goal.service';
import { ReviewService } from './services/review.service';
import { PipService } from './services/pip.service';
import { MeetingService } from './services/meeting.service';
import { ReviewDeadlineProcessor } from './processors/review-deadline.processor';
import { PerformanceController } from './performance.controller';

@Module({
  controllers: [PerformanceController],
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.REVIEW_DEADLINE_CHECK })],
  providers: [ReviewCycleService, GoalService, ReviewService, PipService, MeetingService, ReviewDeadlineProcessor],
  exports: [ReviewCycleService, GoalService, ReviewService, PipService, MeetingService],
})
export class PerformanceModule {}
