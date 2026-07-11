import { Controller, Get, Post, Patch, Body, Param, Inject } from '@nestjs/common';
import { ExitRequestService } from './services/exit-request.service';
import { OffboardingChecklistService } from './services/offboarding-checklist.service';

@Controller('offboarding')
export class OffboardingController {
  constructor(
    @Inject(ExitRequestService) private readonly exitRequests: ExitRequestService,
    @Inject(OffboardingChecklistService) private readonly checklist: OffboardingChecklistService,
  ) {}

  @Post('exit-requests') submit(@Body() dto: any) { return this.exitRequests.submit(dto); }
  @Get('exit-requests') list(@Param('companyId') companyId: string) { return this.exitRequests.list(companyId); }
  @Get('exit-requests/:id') getById(@Param('id') id: string) { return this.exitRequests.getById(id); }
  @Patch('exit-requests/:id/approve') approve(@Param('id') id: string, @Body() dto: any) { return this.exitRequests.approve(id, dto.approverId, dto.approvedLastWorkingDay); }
  @Patch('exit-requests/:id/reject') reject(@Param('id') id: string, @Body() dto: any) { return this.exitRequests.reject(id, dto.approverId, dto.rejectionReason); }
  @Post('exit-requests/:id/cancel') cancel(@Param('id') id: string) { return this.exitRequests.cancel(id); }
  @Post('exit-requests/:id/finalize') finalize(@Param('id') id: string) { return this.exitRequests.finalizeExit(id); }

  @Get('exit-requests/:id/checklist') getChecklist(@Param('id') exitRequestId: string) { return this.checklist.getByExitRequest(exitRequestId); }
  @Patch('checklist-tasks/:id/complete') completeTask(@Param('id') id: string, @Body() dto: any) { return this.checklist.completeTask(id, dto.completedById, dto.notes); }
  @Patch('checklist-tasks/:id/skip') skipTask(@Param('id') id: string, @Body() dto: any) { return this.checklist.skipTask(id, dto.skippedById, dto.notes); }
}
