import { Controller, Get, Post, Patch, Body, Query, Param, Inject } from '@nestjs/common';
import { BenefitPlanService } from './services/benefit-plan.service';

@Controller('benefits')
export class BenefitsController {
  constructor(@Inject(BenefitPlanService) private readonly plans: BenefitPlanService) {}

  @Post('plans') createPlan(@Body() dto: any) { return this.plans.create(dto); }
  @Get('plans') listPlans(@Query('companyId') companyId: string) { return this.plans.listActive(companyId); }
  @Get('plans/:id') getPlan(@Param('id') id: string) { return this.plans.getById(id); }
  @Patch('plans/:id') updatePlan(@Param('id') id: string, @Body() dto: any) { return this.plans.update(id, dto); }
  @Post('plans/:id/archive') archivePlan(@Param('id') id: string) { return this.plans.archive(id); }
}
