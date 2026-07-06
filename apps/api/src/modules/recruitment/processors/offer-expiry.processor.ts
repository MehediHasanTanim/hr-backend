import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '@hr/prisma';
import { QUEUE_NAMES } from '../../../common/queues.constants';

interface OfferExpiryJob {
  offerId: string;
}

@Injectable()
@Processor(QUEUE_NAMES.OFFER_EXPIRY)
export class OfferExpiryProcessor {
  private readonly logger = new Logger(OfferExpiryProcessor.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Process()
  async handle(job: Job<OfferExpiryJob>): Promise<void> {
    const offer = await this.prisma.unscopedClient.offer.findUnique({
      where: { id: job.data.offerId },
    });

    if (offer && offer.status === 'SENT') {
      await this.prisma.unscopedClient.offer.update({
        where: { id: job.data.offerId },
        data: { status: 'EXPIRED' },
      });
      this.logger.log(`Offer ${job.data.offerId} expired`);
    }
  }
}
