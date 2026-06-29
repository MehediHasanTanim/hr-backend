import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuditLogQueryService } from './audit-log-query.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import type { RequestContext } from '../../common/context/request-context';

@Controller('compliance')
export class AuditLogController {
  constructor(private readonly auditLogQueryService: AuditLogQueryService) {}

  @Get('audit-logs')
  @Require.read('admin')
  async listAuditLogs(
    @Query() filters: AuditLogFilterDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.auditLogQueryService.query(filters, user.companyId);
  }

  @Post('audit-logs/export')
  @HttpCode(HttpStatus.ACCEPTED)
  @Require.read('admin')
  async exportAuditLogs(
    @Body() filters: AuditLogFilterDto,
    @CurrentUser() user: RequestContext,
  ) {
    const jobId = crypto.randomUUID();
    // TODO: Enqueue BullMQ job for async export
    return {
      jobId,
      message: 'Export queued. You will be notified when ready.',
    };
  }
}
