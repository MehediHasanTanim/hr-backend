import { Module } from '@nestjs/common';
import { PrismaModule } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CompensationCycleService } from './services/compensation-cycle.service';
import { EquityGrantService } from './services/equity-grant.service';
import { VestingCronProcessor } from './processors/vesting-cron.processor';

@Module({
  imports: [PrismaModule],
  providers: [CompensationCycleService, EquityGrantService, VestingCronProcessor],
  exports: [CompensationCycleService, EquityGrantService, VestingCronProcessor],
})
export class CompensationModule {}
