import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../../common/context/request-context';
import {
  CreateHolidayCalendarBody,
  UpdateHolidayCalendarBody,
  AddHolidayBody,
  UpdateHolidayBody,
  HolidayCalendarQuerySchema,
} from '../dto/holiday-calendar.dto';
import { HolidayCalendarService } from '../services/holiday-calendar.service';
import { HolidayService } from '../services/holiday.service';

@Controller()
export class HolidayController {
  constructor(
    @Inject(HolidayCalendarService) private readonly calendars: HolidayCalendarService,
    @Inject(HolidayService) private readonly holidays: HolidayService,
  ) {}

  @Post('holiday-calendars')
  @Require.write('leave')
  createCalendar(@CurrentUser() user: RequestContext, @Body() dto: CreateHolidayCalendarBody) {
    return this.calendars.createCalendar(user.companyId, dto as any);
  }

  @Get('holiday-calendars')
  @Require.read('leave')
  listCalendars(
    @CurrentUser() user: RequestContext,
    @Query() query: unknown,
  ) {
    const { year } = HolidayCalendarQuerySchema.parse(query);
    return this.calendars.listCalendars(user.companyId, year);
  }

  @Put('holiday-calendars/:id')
  @Require.write('leave')
  updateCalendar(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: UpdateHolidayCalendarBody,
  ) {
    return this.calendars.updateCalendar(user.companyId, id, dto as any);
  }

  @Delete('holiday-calendars/:id')
  @Require.write('leave')
  deleteCalendar(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.calendars.deleteCalendar(user.companyId, id);
  }

  @Post('holiday-calendars/:calendarId/holidays')
  @Require.write('leave')
  addHoliday(
    @CurrentUser() user: RequestContext,
    @Param('calendarId') calendarId: string,
    @Body() dto: AddHolidayBody,
  ) {
    return this.holidays.addHoliday(calendarId, user.companyId, dto as any);
  }

  @Get('holiday-calendars/:calendarId/holidays')
  @Require.read('leave')
  listHolidays(
    @CurrentUser() user: RequestContext,
    @Param('calendarId') calendarId: string,
  ) {
    return this.holidays.listHolidays(calendarId, user.companyId);
  }

  @Put('holidays/:id')
  @Require.write('leave')
  updateHoliday(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: UpdateHolidayBody,
  ) {
    return this.holidays.updateHoliday(id, user.companyId, dto as any);
  }

  @Delete('holidays/:id')
  @Require.write('leave')
  deleteHoliday(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.holidays.deleteHoliday(id, user.companyId);
  }
}
