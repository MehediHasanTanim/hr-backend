import {
  Body,
  Controller,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../../common/context/request-context';
import { ApplyLeaveBody, RejectLeaveBody } from '../dto/leave-request.dto';
import { LeaveRequestService } from '../services/leave-request.service';

@Controller('leave')
export class LeaveRequestController {
  constructor(@Inject(LeaveRequestService) private readonly leaveRequestService: LeaveRequestService) {}

  @Post('apply')
  @Require.write('leave')
  apply(@CurrentUser() user: RequestContext, @Body() dto: ApplyLeaveBody) {
    return this.leaveRequestService.apply(user.userId, user.companyId, dto as any);
  }

  @Post(':requestId/approve')
  @Require.write('leave')
  approve(
    @CurrentUser() user: RequestContext,
    @Param('requestId') requestId: string,
  ) {
    return this.leaveRequestService.approve(requestId, user.userId, user.companyId);
  }

  @Post(':requestId/reject')
  @Require.write('leave')
  reject(
    @CurrentUser() user: RequestContext,
    @Param('requestId') requestId: string,
    @Body() dto: RejectLeaveBody,
  ) {
    return this.leaveRequestService.reject(requestId, user.userId, user.companyId, dto as any);
  }

  @Post(':requestId/cancel')
  @Require.write('leave')
  cancel(
    @CurrentUser() user: RequestContext,
    @Param('requestId') requestId: string,
  ) {
    return this.leaveRequestService.cancel(requestId, user.userId, user.companyId);
  }
}
