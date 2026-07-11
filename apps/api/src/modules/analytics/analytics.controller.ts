import { Controller, Get, Post, Body, Query, Param, Inject } from '@nestjs/common';
import { WorkforceDemographicsService, PayrollTrendsService, LeaveLiabilityService } from '../services/dashboard.service';
import { ReportBuilderService } from '../services/report-builder.service';
import { AttritionRiskScoringService } from '../services/attrition-risk.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    @Inject(WorkforceDemographicsService) private readonly demographics: WorkforceDemographicsService,
    @Inject(PayrollTrendsService) private readonly payrollTrends: PayrollTrendsService,
    @Inject(LeaveLiabilityService) private readonly leaveLiability: LeaveLiabilityService,
    @Inject(ReportBuilderService) private readonly reportBuilder: ReportBuilderService,
    @Inject(AttritionRiskScoringService) private readonly attritionRisk: AttritionRiskScoringService,
  ) {}

  @Get('dashboard/workforce-demographics')
  getDemographics(@Query('companyId') companyId: string) { return this.demographics.getDemographics(companyId); }

  @Get('dashboard/payroll-trends')
  getPayrollTrends(@Query('companyId') companyId: string, @Query('months') months?: string) { return this.payrollTrends.getTrends(companyId, months ? Number(months) : 12); }

  @Get('dashboard/leave-liability')
  getLeaveLiability(@Query('companyId') companyId: string) { return this.leaveLiability.getLiability(companyId); }

  @Post('reports/saved')
  createReport(@Body() dto: any) { return this.reportBuilder.create(dto); }

  @Get('reports/saved')
  listReports(@Query('companyId') companyId: string) { return this.reportBuilder.list(companyId); }

  @Get('reports/saved/:id')
  getReport(@Param('id') id: string) { return this.reportBuilder.getById(id); }

  @Post('reports/saved/:id/run')
  runReport(@Param('id') id: string, @Body() dto: { userId: string; roles: string[] }) { return this.reportBuilder.run(id, dto.userId, dto.roles); }

  @Get('attrition-risk/:employeeId')
  getAttritionRisk(@Param('employeeId') employeeId: string) { return this.attritionRisk.getLatestForEmployee(employeeId); }
}
