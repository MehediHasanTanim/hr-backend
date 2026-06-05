import { Module } from '@nestjs/common';
import { HolidayController } from './controllers/holiday.controller';
import { HolidayCalendarService } from './services/holiday-calendar.service';
import { HolidayService } from './services/holiday.service';

@Module({
  controllers: [HolidayController],
  providers: [HolidayCalendarService, HolidayService],
  exports: [HolidayService, HolidayCalendarService],
})
export class HolidayModule {}
