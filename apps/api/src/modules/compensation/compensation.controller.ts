import { Controller, Get, Post, Patch, Body, Query, Param, Inject } from '@nestjs/common';
import { CompensationCycleService } from './services/compensation-cycle.service';
import { EquityGrantService } from './services/equity-grant.service';

@Controller('compensation')
export class CompensationController {
  constructor(
    @Inject(CompensationCycleService) private readonly cycles: CompensationCycleService,
    @Inject(EquityGrantService) private readonly equity: EquityGrantService,
  ) {}

  @Post('cycles') createCycle(@Body() dto: any) { return this.cycles.create(dto); }
  @Get('cycles/:id') getCycle(@Param('id') id: string) { return this.cycles.getById(id); }
  @Post('cycles/:id/open') openCycle(@Param('id') id: string) { return this.cycles.open(id); }
  @Post('cycles/:id/lock') lockCycle(@Param('id') id: string) { return this.cycles.lockForApproval(id); }
  @Post('cycles/:id/disburse') disburseCycle(@Param('id') id: string, @Body() dto: any) { return this.cycles.disburse(id, dto.actorId); }
  @Post('cycles/:id/cancel') cancelCycle(@Param('id') id: string, @Body() dto: any) { return this.cycles.cancel(id, dto.reason); }
  @Post('allocations/:id/approve') approveAllocation(@Param('id') id: string, @Body() dto: any) { return this.cycles.approveAllocation(id, dto.approvedAmount, dto.actorId, dto.note); }
  @Post('allocations/:id/reject') rejectAllocation(@Param('id') id: string, @Body() dto: any) { return this.cycles.rejectAllocation(id, dto.actorId, dto.note); }

  @Post('equity/grants') createGrant(@Body() dto: any) { return this.equity.createGrant(dto); }
  @Get('equity/grants/employee/:employeeId') getEmployeeGrants(@Param('employeeId') employeeId: string) { return this.equity.getEmployeeGrants(employeeId); }
  @Get('equity/grants/:id') getGrant(@Param('id') id: string) { return this.equity.getById(id); }
  @Post('equity/grants/:id/cancel') cancelGrant(@Param('id') id: string) { return this.equity.cancelGrant(id); }
}
