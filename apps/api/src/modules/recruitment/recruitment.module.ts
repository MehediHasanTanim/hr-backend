import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../../../common/queues.constants';
import { AuditModule } from '../../audit/audit.module';
import { JobRequisitionController } from './controllers/job-requisition.controller';
import { CareersController } from './controllers/careers.controller';
import { CandidateController } from './controllers/candidate.controller';
import { ApplicationController } from './controllers/application.controller';
import { InterviewController } from './controllers/interview.controller';
import { OfferController } from './controllers/offer.controller';
import { JobRequisitionService } from './services/job-requisition.service';
import { CandidateService } from './services/candidate.service';
import { ApplicationService } from './services/application.service';
import { InterviewService } from './services/interview.service';
import { OfferService } from './services/offer.service';
import { ResumeParsingProcessor } from './processors/resume-parsing.processor';
import { OfferExpiryProcessor } from './processors/offer-expiry.processor';

@Module({
  imports: [
    AuditModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.RESUME_PARSING },
      { name: QUEUE_NAMES.OFFER_EXPIRY },
      { name: QUEUE_NAMES.RECRUITMENT_NOTIFICATIONS },
    ),
  ],
  controllers: [
    JobRequisitionController,
    CareersController,
    CandidateController,
    ApplicationController,
    InterviewController,
    OfferController,
  ],
  providers: [
    JobRequisitionService,
    CandidateService,
    ApplicationService,
    InterviewService,
    OfferService,
    ResumeParsingProcessor,
    OfferExpiryProcessor,
  ],
  exports: [JobRequisitionService, ApplicationService],
})
export class RecruitmentModule {}
