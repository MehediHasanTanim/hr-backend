import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../../common/context/request-context';
import { CreateLeaveTypeBody, UpdateLeaveTypeBody } from '../dto/leave-type.dto';
import { LeaveTypeService } from '../services/leave-type.service';

@Controller('leave-types')
export class LeaveTypeController {
  constructor(@Inject(LeaveTypeService) private readonly leaveTypeService: LeaveTypeService) {}

  @Post()
  @Require.write('leave')
  create(@CurrentUser() user: RequestContext, @Body() dto: CreateLeaveTypeBody) {
    return this.leaveTypeService.create(user.companyId, dto as any);
  }

  @Get()
  @Require.read('leave')
  findAll(@CurrentUser() user: RequestContext) {
    return this.leaveTypeService.findAll(user.companyId);
  }

  @Put(':id')
  @Require.write('leave')
  update(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveTypeBody,
  ) {
    return this.leaveTypeService.update(id, user.companyId, dto as any);
  }

  @Delete(':id')
  @Require.write('leave')
  remove(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.leaveTypeService.softDelete(id, user.companyId);
  }
}
