import { Module } from '@nestjs/common';
import { PrismaModule } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CertificationRegistryService } from './services/certification-registry.service';
import { EmployeeCertificationService } from './services/employee-certification.service';
import { CertificationExpiryCronProcessor } from './processors/certification-expiry-cron.processor';
import { AuditService } from '../audit/audit.service';
import { CertificationController } from './certification.controller';

@Module({
  controllers: [CertificationController],
  imports: [PrismaModule],
  providers: [
    CertificationRegistryService,
    EmployeeCertificationService,
    CertificationExpiryCronProcessor,
    AuditService,
  ],
  exports: [
    CertificationRegistryService,
    EmployeeCertificationService,
    CertificationExpiryCronProcessor,
  ],
})
export class CertificationModule {}
