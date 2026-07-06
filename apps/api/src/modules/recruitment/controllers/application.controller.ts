import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../../common/context/request-context';
import { ApplicationService } from '../services/application.service';
import { MoveApplicationStageSchema, RejectApplicationSchema } from '../dto/application.dto';
import type { MoveApplicationStageDto, RejectApplicationDto } from '../dto/application.dto';

@Controller('applications')
export class ApplicationController {
  constructor(@Inject(ApplicationService) private readonly service: ApplicationService) {}

  @Get()
  @Require.read('recruitment')
  findAll(@Query('requisitionId') reqId?: string, @Query('stage') stage?: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.findAll(reqId, stage, Number(page), Number(limit));
  }

  @Get(':id')
  @Require.read('recruitment')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id/stage')
  @Require.write('recruitment')
  moveStage(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto: unknown) {
    return this.service.moveStage(id, (MoveApplicationStageSchema.parse(dto) as MoveApplicationStageDto).targetStage, user.userId);
  }

  @Patch(':id/reject')
  @Require.write('recruitment')
  reject(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto: unknown) {
    return this.service.reject(id, (RejectApplicationSchema.parse(dto) as RejectApplicationDto).reason, user.userId);
  }
}
