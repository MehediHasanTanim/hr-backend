import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../../common/context/request-context';
import { ReportQuerySchema, type ReportQueryDto } from './dto/report-query.dto';
import { SaveReportSchema, type SaveReportDto } from './dto/save-report.dto';
import {
  CreateReportScheduleSchema,
  type CreateReportScheduleDto,
} from './dto/create-report-schedule.dto';
import { TriggerExportSchema, type TriggerExportDto } from './dto/trigger-export.dto';
import { ReportQueryService } from './services/report-query.service';
import { SavedReportService } from './services/saved-report.service';
import { ReportScheduleService } from './services/report-schedule.service';
import type { ReportResultDto } from './dto/report-result.dto';
import type { ExportJobAcceptedDto } from './dto/export-job-accepted.dto';

@Controller('reports')
export class ReportsController {
  constructor(
    @Inject(ReportQueryService) private readonly reportQuery: ReportQueryService,
    @Inject(SavedReportService) private readonly savedReport: SavedReportService,
    @Inject(ReportScheduleService) private readonly reportSchedule: ReportScheduleService,
  ) {}

  @Get('preview')
  @Require.export('report')
  async preview(@Query() query: unknown): Promise<ReportResultDto> {
    return this.reportQuery.run(
      ReportQuerySchema.parse(query) as ReportQueryDto,
    );
  }

  @Post('saved')
  @Require.write('report')
  save(@CurrentUser() user: RequestContext, @Body() dto: unknown) {
    return this.savedReport.save(
      SaveReportSchema.parse(dto) as SaveReportDto,
      user.userId,
    );
  }

  @Get('saved')
  @Require.read('report')
  listSaved(@CurrentUser() user: RequestContext) {
    return this.savedReport.list(user.userId);
  }

  @Delete('saved/:id')
  @Require.delete('report')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSaved(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.savedReport.delete(id, user.userId);
  }

  @Post('saved/:id/export')
  @Require.export('report')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerExport(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: unknown,
  ): Promise<ExportJobAcceptedDto> {
    return this.savedReport.triggerExport(
      id,
      user.userId,
      TriggerExportSchema.parse(dto) as TriggerExportDto,
    );
  }

  @Post('schedules')
  @Require.write('report')
  createSchedule(
    @CurrentUser() user: RequestContext,
    @Body() dto: unknown,
  ) {
    return this.reportSchedule.create(
      CreateReportScheduleSchema.parse(dto) as CreateReportScheduleDto,
      user.userId,
    );
  }

  @Get('schedules')
  @Require.read('report')
  listSchedules(@CurrentUser() user: RequestContext) {
    return this.reportSchedule.list(user.userId);
  }

  @Patch('schedules/:id/toggle')
  @Require.write('report')
  toggleSchedule(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportSchedule.toggleActive(id, user.userId);
  }
}
