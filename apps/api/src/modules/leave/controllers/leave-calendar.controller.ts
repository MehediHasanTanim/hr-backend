import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../../common/context/request-context';
import { LeaveCalendarQuerySchema } from '../dto/leave-request.dto';
import { LeaveCalendarService } from '../services/leave-calendar.service';

@Controller('leave')
export class LeaveCalendarController {
  constructor(@Inject(LeaveCalendarService) private readonly leaveCalendarService: LeaveCalendarService) {}

  @Get('calendar')
  @Require.read('leave')
  getCalendar(@CurrentUser() user: RequestContext, @Query() query: unknown) {
    const parsed = LeaveCalendarQuerySchema.parse(query);
    return this.leaveCalendarService.getCalendar(user.companyId, parsed);
  }
}
