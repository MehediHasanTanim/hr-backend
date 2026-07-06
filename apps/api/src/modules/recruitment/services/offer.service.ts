import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { S3Service } from '../../../common/s3/s3.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../../common/queues.constants';
import { round2dp } from '../../payroll/utils/round2dp';
import { JobRequisitionService } from './job-requisition.service';
import { ApplicationService } from './application.service';
import type { CreateOfferDto, DeclineOfferDto, RescindOfferDto } from '../dto/offer.dto';
import type { Prisma } from '@prisma/client';

@Injectable()
export class OfferService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Inject(S3Service) private readonly s3: S3Service,
    @Inject(JobRequisitionService) private readonly requisitionService: JobRequisitionService,
    @Inject(ApplicationService) private readonly applicationService: ApplicationService,
    @InjectQueue(QUEUE_NAMES.OFFER_EXPIRY) private readonly offerExpiryQueue: Queue,
  ) {}

  async create(applicationId: string, dto: CreateOfferDto, createdById: string): Promise<unknown> {
    const app = await this.prisma.unscopedClient.application.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('Application not found');

    // Auto-transition to OFFER stage if needed
    if (app.stage !== 'OFFER') {
      await this.applicationService.moveStage(applicationId, 'OFFER', createdById);
    }

    const offer = await this.prisma.unscopedClient.offer.create({
      data: {
        applicationId,
        baseSalary: round2dp(dto.baseSalary),
        bonus: dto.bonus ? round2dp(dto.bonus) : null,
        equityValue: dto.equityValue ? round2dp(dto.equityValue) : null,
        currency: dto.currency,
        startDate: new Date(dto.startDate),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById,
      },
    });

    return offer;
  }

  async send(offerId: string): Promise<unknown> {
    const offer = await this.prisma.unscopedClient.offer.findUnique({
      where: { id: offerId },
      include: { application: { include: { candidate: true } } },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.status !== 'DRAFT') throw new BadRequestException('Only draft offers can be sent');

    // Generate offer letter PDF (stub)
    const s3Key = `offers/${offerId}/letter.pdf`;
    // In production, generate PDF with pdfmake and upload to S3

    const updated = await this.prisma.unscopedClient.offer.update({
      where: { id: offerId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        offerLetterS3Key: s3Key,
      },
    });

    // Schedule expiry job if expiresAt is set
    if (offer.expiresAt) {
      const delayMs = new Date(offer.expiresAt).getTime() - Date.now();
      if (delayMs > 0) {
        await this.offerExpiryQueue.add(QUEUE_NAMES.OFFER_EXPIRY, { offerId }, { delay: delayMs });
      }
    }

    this.events.emit('offer.sent', { offerId, applicationId: offer.applicationId });
    this.audit.logAsync({
      companyId: '',
      entityType: 'offer',
      entityId: offerId,
      action: 'OFFER_SENT',
    });

    return updated;
  }

  async accept(offerId: string): Promise<unknown> {
    // UnitOfWork: lock offer, update status, hire application, increment headcount
    const result = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: { application: true },
      });
      if (!offer) throw new NotFoundException('Offer not found');
      if (offer.status !== 'SENT') throw new BadRequestException('Only sent offers can be accepted');
      if (offer.expiresAt && new Date() > offer.expiresAt) throw new BadRequestException('Offer has expired');

      await tx.offer.update({
        where: { id: offerId },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });

      await this.applicationService.hireApplication(offer.applicationId, tx);
      await this.requisitionService.incrementHeadcountFilled(offer.application.requisitionId, tx);

      return offer;
    });

    this.events.emit('offer.accepted', { offerId, applicationId: result.applicationId });
    this.audit.logAsync({
      companyId: '',
      entityType: 'offer',
      entityId: offerId,
      action: 'OFFER_ACCEPTED',
    });

    return result;
  }

  async decline(offerId: string, dto: DeclineOfferDto): Promise<unknown> {
    const result = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({ where: { id: offerId } });
      if (!offer) throw new NotFoundException('Offer not found');
      if (offer.status !== 'SENT') throw new BadRequestException('Only sent offers can be declined');

      await tx.offer.update({
        where: { id: offerId },
        data: { status: 'DECLINED', declineReason: dto.reason, respondedAt: new Date() },
      });

      await tx.application.update({
        where: { id: offer.applicationId },
        data: { stage: 'REJECTED', rejectionReason: `Offer declined: ${dto.reason}` },
      });

      return offer;
    });

    this.audit.logAsync({
      companyId: '',
      entityType: 'offer',
      entityId: offerId,
      action: 'OFFER_DECLINED',
    });

    return result;
  }

  async rescind(offerId: string, dto: RescindOfferDto): Promise<unknown> {
    const offer = await this.prisma.unscopedClient.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (['ACCEPTED', 'DECLINED', 'EXPIRED'].includes(offer.status)) {
      throw new BadRequestException('Cannot rescind a resolved offer');
    }

    const updated = await this.prisma.unscopedClient.offer.update({
      where: { id: offerId },
      data: { status: 'RESCINDED', declineReason: dto.reason, respondedAt: new Date() },
    });

    this.audit.logAsync({
      companyId: '',
      entityType: 'offer',
      entityId: offerId,
      action: 'OFFER_RESCINDED',
    });

    return updated;
  }

  async findById(id: string): Promise<unknown> {
    const offer = await this.prisma.unscopedClient.offer.findUnique({
      where: { id },
      include: { application: { include: { candidate: true } } },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    return offer;
  }
}
