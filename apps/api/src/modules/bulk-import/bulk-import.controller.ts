import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { uuidSchema } from '../employees/dto/employee.dto';
import {
  EmployeeCsvImportBody,
  type EmployeeCsvImportDto,
} from './dto/bulk-import.dto';
import { BulkImportService } from './bulk-import.service';

@Controller('bulk-import')
export class BulkImportController {
  constructor(@Inject(BulkImportService) private readonly imports: BulkImportService) {}

  @Post('employees')
  @Require.write('employee')
  uploadEmployees(@CurrentUser() user: RequestContext, @Body() dto: EmployeeCsvImportBody) {
    return this.imports.createEmployeeImportJob(user, (dto as EmployeeCsvImportDto).csv);
  }

  @Get('jobs/:jobId')
  @Require.read('employee')
  getJob(@CurrentUser() user: RequestContext, @Param('jobId') jobId: string) {
    return this.imports.getJob(user, uuidSchema.parse(jobId));
  }
}
