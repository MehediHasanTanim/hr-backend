import { Module } from '@nestjs/common';
import { PrismaModule } from '@hr/prisma';
import { BenefitPlanService } from './services/benefit-plan.service';
import { BenefitsController } from './benefits.controller';

@Module({
  controllers: [BenefitsController],
  imports: [PrismaModule],
  providers: [BenefitPlanService],
  exports: [BenefitPlanService],
})
export class BenefitsModule {}
