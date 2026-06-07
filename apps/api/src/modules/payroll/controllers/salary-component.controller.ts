import {
  Body, Controller, Delete, Get, Inject, Param, Post, Put,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import { SalaryComponentService } from '../services/salary-component.service';
import type { CreateSalaryComponentDto, UpdateSalaryComponentDto } from '../dto/create-salary-component.dto';
import type { RequestContext } from '../../../common/context/request-context';

@Controller()
export class SalaryComponentController {
  constructor(
    @Inject(SalaryComponentService) private readonly service: SalaryComponentService,
  ) {}

  @Post('salary-components')
  @Require.write('payroll')
  create(@Body() dto: CreateSalaryComponentDto, @CurrentUser() user: RequestContext) {
    return this.service.create(dto, user.companyId);
  }

  @Get('salary-components')
  @Require.read('payroll')
  findAll(@CurrentUser() user: RequestContext) {
    return this.service.findAll(user.companyId);
  }

  @Get('salary-components/:id')
  @Require.read('payroll')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestContext) {
    return this.service.findOneOrFail(id, user.companyId);
  }

  @Put('salary-components/:id')
  @Require.write('payroll')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSalaryComponentDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.update(id, dto, user.companyId);
  }

  @Delete('salary-components/:id')
  @Require.delete('payroll')
  remove(@Param('id') id: string, @CurrentUser() user: RequestContext) {
    return this.service.softDelete(id, user.companyId);
  }
}
