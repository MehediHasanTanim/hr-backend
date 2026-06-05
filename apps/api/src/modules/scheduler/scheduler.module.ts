import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LeaveModule } from '../leave/leave.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), LeaveModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
