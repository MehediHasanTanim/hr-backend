import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '@hr/prisma';
import { CandidateService } from '../services/candidate.service';
import { JobRequisitionService } from '../services/job-requisition.service';
import { AuditService } from '../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../../common/queues.constants';
import { PublicApplySchema, type PublicApplyDto } from '../dto/careers.dto';

@Controller()
export class CareersController {
  constructor(
    @Inject(JobRequisitionService) private readonly requisitionService: JobRequisitionService,
    @Inject(CandidateService) private readonly candidateService: CandidateService,
    @Inject(ApplicationService) private readonly applicationService: ApplicationService,
    @Inject(S3Service) private readonly s3: S3Service,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @InjectQueue(QUEUE_NAMES.RESUME_PARSING) private readonly resumeParsingQueue: Queue,
  ) {}

  @Get('careers')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async list(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.requisitionService.findOpenForCareers(Number(page), Number(limit));
  }

  @Get('careers/:slug')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async getBySlug(@Param('slug') slug: string) {
    return this.requisitionService.findBySlug(slug);
  }

  @Post('careers/:slug/apply')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async apply(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const dto = PublicApplySchema.parse(body) as PublicApplyDto;

    // Validate requisition is open
    const requisition = await this.requisitionService.findBySlug(slug);
    const reqId = (requisition as any).id;

    // Handle file upload if present
    let resumeS3Key: string | undefined;
    const file = (req as any).file?.();
    if (file) {
      const ext = (await file).filename?.split('.').pop() ?? 'pdf';
      const key = `resumes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await this.s3.uploadStream({ bucket: '', key, body: (await file).file, contentType: 'application/pdf' });
      resumeS3Key = key;
    }

    // Find or create candidate
    const { id: candidateId } = await this.candidateService.findOrCreateByEmail({ ...dto, resumeS3Key });

    // Create application
    const application = await this.prisma.unscopedClient.application.create({
      data: { candidateId, requisitionId: reqId },
    });

    // Enqueue resume parsing (best-effort, async)
    if (resumeS3Key) {
      await this.resumeParsingQueue.add(QUEUE_NAMES.RESUME_PARSING, {
        candidateId,
        s3Key: resumeS3Key,
      }).catch(() => {});
    }

    // Post-commit
    this.events.emit('application.created', { applicationId: application.id, requisitionId: reqId });
    this.audit.logAsync({
      companyId: '',
      entityType: 'application',
      entityId: application.id,
      action: 'APPLICATION_SUBMITTED',
      newValue: this.audit.stripPii({ requisitionId: reqId, applicationId: application.id }),
    });

    return application;
  }
}
