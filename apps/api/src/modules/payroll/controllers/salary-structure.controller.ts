import {
  Body, Controller, Delete, Get, Inject, Param, Post, Put,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import { SalaryStructureService } from '../services/salary-structure.service';
import type { CreateSalaryStructureDto, UpdateSalaryStructureDto } from '../dto/create-salary-structure.dto';
import type { RequestContext } from '../../../common/context/request-context';

const CloneStructureSchema = z.object({
  name: z.string().min(1).max(100),
});

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

  @Post('salary-structures/:id/clone')
  @Require.write('payroll')
  clone(
    @Param('id') id: string,
    @Body() dto: unknown,
    @CurrentUser() user: RequestContext,
  ) {
    const { name } = CloneStructureSchema.parse(dto);
    return this.service.clone(id, name, user.companyId);
  }

  @Delete('salary-structures/:id')
  @Require.delete('payroll')
  remove(@Param('id') id: string, @CurrentUser() user: RequestContext) {
    return this.service.softDelete(id, user.companyId);
  }
}
