import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class VestingCronProcessor {
  private readonly logger = new Logger(VestingCronProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async processDueVestingEvents() {
    const today = new Date().toISOString().slice(0, 10);

    const dueEvents = await this.prisma.unscopedClient.vestingEvent.findMany({
      where: { status: 'PENDING', vestDate: { lte: new Date(today) } },
      include: { grant: true },
    });

    for (const event of dueEvents) {
      await this.prisma.unscopedClient.$transaction(async (tx) => {
        await tx.vestingEvent.update({
          where: { id: event.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
        const newVested = event.grant.vestedUnits + event.unitsVested;
        const newStatus = newVested >= event.grant.totalUnits ? 'FULLY_VESTED' : undefined;
        await tx.equityGrant.update({
          where: { id: event.equityGrantId },
          data: { vestedUnits: newVested, ...(newStatus ? { status: newStatus } : {}) },
        });
      });

      this.events.emit('vesting.event_processed', { vestingEventId: event.id, grantId: event.equityGrantId, unitsVested: event.unitsVested });
    }

    this.logger.log(`Processed ${dueEvents.length} vesting events`);
  }
}
