import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../../common/queues.constants';
import { CandidateService } from '../services/candidate.service';

interface ResumeParsingJob {
  candidateId: string;
  s3Key: string;
}

@Injectable()
@Processor(QUEUE_NAMES.RESUME_PARSING)
export class ResumeParsingProcessor {
  private readonly logger = new Logger(ResumeParsingProcessor.name);

  constructor(@Inject(CandidateService) private readonly candidateService: CandidateService) {}

  @Process()
  async handle(job: Job<ResumeParsingJob>): Promise<void> {
    this.logger.log(`Parsing resume for candidate ${job.data.candidateId}`);
    try {
      await this.candidateService.parseResumeStub(job.data.candidateId, job.data.s3Key);
    } catch (err) {
      this.logger.error(`Resume parsing failed for ${job.data.candidateId}`, err);
      // Do not re-throw — parsing is best-effort and should not block
    }
  }
}
