import { Module } from '@nestjs/common';
import { PrismaModule } from '@hr/prisma';
import { BenefitPlanService } from './services/benefit-plan.service';

@Module({
  imports: [PrismaModule],
  providers: [BenefitPlanService],
  exports: [BenefitPlanService],
})
export class BenefitsModule {}
