import {
  Body, Controller, Delete, Get, Inject, Param, Post, Put,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import { SalaryStructureService } from '../services/salary-structure.service';
import type { CreateSalaryStructureDto, UpdateSalaryStructureDto } from '../dto/create-salary-structure.dto';
import type { RequestContext } from '../../../common/context/request-context';

@Controller()
export class SalaryStructureController {
  constructor(
    @Inject(SalaryStructureService) private readonly service: SalaryStructureService,
  ) {}

  @Post('salary-structures')
  @Require.write('payroll')
  create(@Body() dto: CreateSalaryStructureDto, @CurrentUser() user: RequestContext) {
    return this.service.create(dto, user.companyId);
  }

  @Get('salary-structures')
  @Require.read('payroll')
  findAll(@CurrentUser() user: RequestContext) {
    return this.service.findAll(user.companyId);
  }

  @Get('salary-structures/:id')
  @Require.read('payroll')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestContext) {
    return this.service.findOneOrFail(id, user.companyId);
  }

  @Put('salary-structures/:id')
  @Require.write('payroll')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSalaryStructureDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.update(id, dto, user.companyId);
  }

  @Delete('salary-structures/:id')
  @Require.delete('payroll')
  remove(@Param('id') id: string, @CurrentUser() user: RequestContext) {
    return this.service.softDelete(id, user.companyId);
  }
}
