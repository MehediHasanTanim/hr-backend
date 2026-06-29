import { Module } from '@nestjs/common';
import { ComplianceController } from './compliance.controller';
import { AuditLogController } from './audit-log.controller';
import { AuditLogQueryService } from './audit-log-query.service';

@Module({
  controllers: [ComplianceController, AuditLogController],
  providers: [AuditLogQueryService],
  exports: [AuditLogQueryService],
})
export class ComplianceModule {}
