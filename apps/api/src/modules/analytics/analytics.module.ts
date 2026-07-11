import { Module } from '@nestjs/common';
import { PrismaModule } from '@hr/prisma';
import { WorkforceDemographicsService, PayrollTrendsService, LeaveLiabilityService } from './services/dashboard.service';
import { ReportBuilderService } from './services/report-builder.service';
import { AttritionRiskScoringService } from './services/attrition-risk.service';
import { AuditService } from '../audit/audit.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  controllers: [AnalyticsController],
  imports: [PrismaModule],
  providers: [
    WorkforceDemographicsService, PayrollTrendsService, LeaveLiabilityService,
    ReportBuilderService, AttritionRiskScoringService, AuditService,
  ],
  exports: [
    WorkforceDemographicsService, PayrollTrendsService, LeaveLiabilityService,
    ReportBuilderService, AttritionRiskScoringService,
  ],
})
export class AnalyticsModule {}
