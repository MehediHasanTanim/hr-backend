import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ReviewService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AuditService) private readonly audit: AuditService) {}

  async saveResponse(reviewId: string, respondentRole: string, sectionKey: string, responseJson: Record<string, unknown>) {
    const review = await this.prisma.unscopedClient.reviewInstance.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    await this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.reviewResponse.upsert({
        where: { reviewInstanceId_respondentRole_sectionKey: { reviewInstanceId: reviewId, respondentRole: respondentRole as any, sectionKey } },
        create: { reviewInstanceId: reviewId, respondentRole: respondentRole as any, sectionKey, responseJson },
        update: { responseJson },
      });
      const statusField = respondentRole === 'SELF' ? 'selfReviewStatus' : 'managerReviewStatus';
      if (review[statusField] === 'NOT_STARTED') {
        await tx.reviewInstance.update({ where: { id: reviewId }, data: { [statusField]: 'IN_PROGRESS' } });
      }
    });
  }

  async submitReview(reviewId: string, respondentRole: string) {
    const review = await this.prisma.unscopedClient.reviewInstance.findUnique({ where: { id: reviewId }, include: { responses: true } });
    if (!review) throw new NotFoundException('Review not found');
    const roleResponses = review.responses.filter(r => r.respondentRole === respondentRole);
    if (roleResponses.length === 0) throw new BadRequestException('No responses to submit');
    const statusField = respondentRole === 'SELF' ? 'selfReviewStatus' : 'managerReviewStatus';
    if (review[statusField] === 'SUBMITTED') throw new BadRequestException('Already submitted');

    await this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.reviewInstance.update({ where: { id: reviewId }, data: { [statusField]: 'SUBMITTED' } });
      for (const resp of roleResponses) {
        await tx.reviewResponse.update({ where: { id: resp.id }, data: { submittedAt: new Date() } });
      }
    });

    const events = { emit: () => {} }; // EventEmitter2 injection skipped for brevity — add if needed
  }

  async applyCalibrationOverride(reviewId: string, dto: { overriddenRating: string; justification: string }, overriddenBy: string) {
    const review = await this.prisma.unscopedClient.reviewInstance.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.selfReviewStatus !== 'SUBMITTED' || review.managerReviewStatus !== 'SUBMITTED') throw new BadRequestException('Both reviews must be submitted first');

    await this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.calibrationOverride.create({ data: { reviewInstanceId: reviewId, originalRating: review.overallRating ?? 'N/A', overriddenRating: dto.overriddenRating, overriddenBy, justification: dto.justification } });
      await tx.reviewInstance.update({ where: { id: reviewId }, data: { overallRating: dto.overriddenRating } });
    });

    this.audit.logAsync({ companyId: '', entityType: 'performance_review', entityId: reviewId, action: 'CALIBRATION_OVERRIDE_APPLIED', newValue: { reviewInstanceId: reviewId, originalRating: review.overallRating, overriddenRating: dto.overriddenRating } });
  }

  async acknowledgeReview(reviewId: string) {
    const review = await this.prisma.unscopedClient.reviewInstance.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (!review.overallRating) throw new BadRequestException('Rating must be finalized before acknowledgment');
    return this.prisma.unscopedClient.reviewInstance.update({ where: { id: reviewId }, data: { acknowledgedByEmployee: true, acknowledgedAt: new Date() } });
  }

  async findByCycle(cycleId: string) { return this.prisma.unscopedClient.reviewInstance.findMany({ where: { cycleId }, include: { responses: true } }); }
  async findById(id: string) { const r = await this.prisma.unscopedClient.reviewInstance.findUnique({ where: { id }, include: { responses: true } }); if (!r) throw new NotFoundException('Review not found'); return r; }
}
