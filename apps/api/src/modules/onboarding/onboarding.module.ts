import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../../../common/queues.constants';
import { OnboardingTemplateService } from './services/onboarding-template.service';
import { OnboardingAssignmentService } from './services/onboarding-assignment.service';
import { OnboardingReminderProcessor } from './processors/onboarding-reminder.processor';
import { OnboardingController } from './onboarding.controller';

@Module({
  controllers: [OnboardingController],
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.ONBOARDING_TASK_REMINDER })],
  providers: [OnboardingTemplateService, OnboardingAssignmentService, OnboardingReminderProcessor],
  exports: [OnboardingAssignmentService],
})
export class OnboardingModule {}
