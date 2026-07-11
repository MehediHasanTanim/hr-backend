import { Module } from '@nestjs/common';
import { PrismaModule } from '@hr/prisma';
import { ExitRequestService } from './services/exit-request.service';
import { OffboardingChecklistService } from './services/offboarding-checklist.service';
import { AuditService } from '../audit/audit.service';
import { OffboardingController } from './offboarding.controller';

@Module({
  controllers: [OffboardingController],
  imports: [PrismaModule],
  providers: [ExitRequestService, OffboardingChecklistService, AuditService],
  exports: [ExitRequestService, OffboardingChecklistService],
})
export class OffboardingModule {}
