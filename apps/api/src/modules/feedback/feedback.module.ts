import { Module } from '@nestjs/common';
import { FeedbackService } from './services/feedback.service';

@Module({
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
