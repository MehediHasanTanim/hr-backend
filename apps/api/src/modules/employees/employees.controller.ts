import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { EmployeeWriteBody, type EmployeeWriteDto } from './dto/employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(@Inject(EmployeesService) private readonly employees: EmployeesService) {}

  @Get()
  @Require.write('employee')
  list(@CurrentUser() user: RequestContext) {
    return this.employees.list(user);
  }

  @Get(':id')
  @Require.read('employee')
  get(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.employees.get(user, id);
  }

  @Post()
  @Require.write('employee')
  create(@CurrentUser() user: RequestContext, @Body() dto: EmployeeWriteBody) {
    return this.employees.create(user, dto as EmployeeWriteDto);
  }

  @Patch(':id')
  @Require.write('employee')
  update(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: EmployeeWriteBody,
  ) {
    return this.employees.update(user, id, dto as EmployeeWriteDto);
  }

  @Delete(':id')
  @Require.delete('employee')
  remove(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.employees.remove(user, id);
  }
}
