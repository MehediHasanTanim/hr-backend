import { Module } from '@nestjs/common';
import { EsignController } from './esign.controller';
import { EsignService } from './esign.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [EsignController],
  providers: [EsignService],
  exports: [EsignService],
})
export class EsignModule {}
