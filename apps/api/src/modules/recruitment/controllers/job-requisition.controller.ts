import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../../common/context/request-context';
import { JobRequisitionService } from '../services/job-requisition.service';
import { CreateJobRequisitionSchema, ApproveRequisitionSchema, CloseRequisitionSchema } from '../dto/job-requisition.dto';
import type { CreateJobRequisitionDto, ApproveRequisitionDto, CloseRequisitionDto } from '../dto/job-requisition.dto';

@Controller('requisitions')
export class JobRequisitionController {
  constructor(@Inject(JobRequisitionService) private readonly service: JobRequisitionService) {}

  @Post()
  @Require.write('recruitment')
  create(@CurrentUser() user: RequestContext, @Body() dto: unknown) {
    return this.service.create({ ...CreateJobRequisitionSchema.parse(dto) as CreateJobRequisitionDto, requestedById: user.userId });
  }

  @Patch(':id/submit')
  @Require.write('recruitment')
  submit(@Param('id') id: string) {
    return this.service.submitForApproval(id);
  }

  @Patch(':id/approve')
  @Require.approve('recruitment')
  approve(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto: unknown) {
    return this.service.approve(id, user.userId, ApproveRequisitionSchema.parse(dto) as ApproveRequisitionDto);
  }

  @Patch(':id/hold')
  @Require.write('recruitment')
  hold(@Param('id') id: string) {
    return this.service.hold(id);
  }

  @Patch(':id/close')
  @Require.write('recruitment')
  close(@Param('id') id: string, @Body() dto: unknown) {
    return this.service.close(id, CloseRequisitionSchema.parse(dto) as CloseRequisitionDto);
  }

  @Patch(':id/cancel')
  @Require.write('recruitment')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Get()
  @Require.read('recruitment')
  findAll(@Query('status') status?: string) {
    return this.service.findAll(status);
  }

  @Get(':id')
  @Require.read('recruitment')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
