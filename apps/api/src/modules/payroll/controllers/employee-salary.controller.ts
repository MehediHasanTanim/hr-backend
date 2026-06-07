import {
  Body, Controller, Get, Inject, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import { EmployeeSalaryService } from '../services/employee-salary.service';
import type { AssignEmployeeSalaryDto } from '../dto/assign-employee-salary.dto';
import type { RequestContext } from '../../../common/context/request-context';

@Controller()
export class EmployeeSalaryController {
  constructor(
    @Inject(EmployeeSalaryService) private readonly service: EmployeeSalaryService,
  ) {}

  @Post('employees/:employeeId/salary')
  @Require.write('payroll')
  assign(
    @Param('employeeId') employeeId: string,
    @Body() dto: AssignEmployeeSalaryDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.assign({ ...dto, employeeId }, user);
  }

  @Patch('employees/:employeeId/salary')
  @Require.write('payroll')
  revise(
    @Param('employeeId') employeeId: string,
    @Body() dto: AssignEmployeeSalaryDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.revise(employeeId, { ...dto, employeeId }, user);
  }

  @Get('employees/:employeeId/salary')
  @Require.read('payroll')
  getCurrent(
    @Param('employeeId') employeeId: string,
    @Query('asOfDate') asOfDateStr: string | undefined,
    @CurrentUser() user: RequestContext,
  ) {
    const asOfDate = asOfDateStr ? new Date(asOfDateStr) : undefined;
    return this.service.getCurrentSalary(employeeId, asOfDate, user.companyId);
  }

  @Get('employees/:employeeId/salary/history')
  @Require.read('payroll')
  getHistory(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.getSalaryHistory(employeeId, user.companyId);
  }

  @Patch('salary/:id/approve')
  @Require.approve('payroll')
  approve(@Param('id') id: string, @CurrentUser() user: RequestContext) {
    return this.service.approve(id, user);
  }
}
