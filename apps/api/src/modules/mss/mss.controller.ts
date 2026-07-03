import { Controller, Get, Inject, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { MssService } from './mss.service';
import {
  TeamLeaveQuerySchema,
  type TeamLeaveQueryDto,
} from './dto/team-leave-query.dto';
import type {
  EmployeeSummaryResponseDto,
  TeamLeaveRequestsResponseDto,
} from './dto/employee-summary.dto';

@Controller()
export class MssController {
  constructor(@Inject(MssService) private readonly mssService: MssService) {}

  @Get('employees/:id/summary')
  @Require.read('employee')
  async getEmployeeSummary(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EmployeeSummaryResponseDto> {
    const actorRole = user.roles.includes('Admin') ? 'Admin' : 'Manager';
    return this.mssService.getEmployeeSummary(id, user.userId, actorRole);
  }

  @Get('leave/requests/team')
  @Require.read('leave')
  async getTeamLeaveRequests(
    @CurrentUser() user: RequestContext,
    @Query() query: unknown,
  ): Promise<TeamLeaveRequestsResponseDto> {
    const actorRole = user.roles.includes('Admin') ? 'Admin' : 'Manager';
    return this.mssService.getTeamLeaveRequests(
      user.userId,
      actorRole,
      TeamLeaveQuerySchema.parse(query) as TeamLeaveQueryDto,
    );
  }
}
