import {
  Body, Controller, Get, Inject, Param, Post, Query, Res,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import { PayrollCycleService } from '../services/payroll-cycle.service';
import { BankFileService } from '../services/bank-file.service';
import type { CreatePayrollCycleDto } from '../dto/create-payroll-cycle.dto';
import type { ReverseCycleDto } from '../dto/reverse-cycle.dto';
import type { RequestContext } from '../../../common/context/request-context';
import type { FastifyReply } from 'fastify';

@Controller()
export class PayrollCycleController {
  constructor(
    @Inject(PayrollCycleService) private readonly cycleService: PayrollCycleService,
    @Inject(BankFileService) private readonly bankFileService: BankFileService,
  ) {}

  @Post('payroll/cycles')
  @Require.write('payroll')
  createCycle(@Body() dto: CreatePayrollCycleDto, @CurrentUser() user: RequestContext) {
    return this.cycleService.createCycle(dto, user);
  }

  @Get('payroll/cycles')
  @Require.read('payroll')
  listCycles(
    @Query('year') year: string | undefined,
    @Query('status') status: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentUser() user: RequestContext,
  ) {
    return this.cycleService.listCycles(user.companyId, {
      year: year ? parseInt(year, 10) : undefined,
      status,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('payroll/cycles/:id')
  @Require.read('payroll')
  getCycle(@Param('id') id: string, @CurrentUser() user: RequestContext) {
    return this.cycleService.getCycle(id, user.companyId);
  }

  @Post('payroll/cycles/:id/run')
  @Require.write('payroll')
  runCycle(@Param('id') id: string, @CurrentUser() user: RequestContext) {
    return this.cycleService.runCycle(id, user);
  }

  @Post('payroll/cycles/:id/approve')
  @Require.approve('payroll')
  approveCycle(@Param('id') id: string, @CurrentUser() user: RequestContext) {
    return this.cycleService.approveCycle(id, user);
  }

  @Post('payroll/cycles/:id/disburse')
  @Require.write('payroll')
  disburseCycle(@Param('id') id: string, @CurrentUser() user: RequestContext) {
    return this.cycleService.disburseCycle(id, user);
  }

  @Post('payroll/cycles/:id/reverse')
  @Require.write('payroll')
  reverseCycle(
    @Param('id') id: string,
    @Body() dto: ReverseCycleDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.cycleService.reverseCycle(id, user, dto);
  }

  @Get('payroll/cycles/:id/bank-file')
  @Require.read('payroll')
  async exportBankFile(
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @CurrentUser() user: RequestContext,
    @Res() reply: FastifyReply,
  ) {
    const fmt = format === 'ach' ? 'ach' : 'neft';
    const result = await this.bankFileService.exportBankFile(id, fmt, user);
    reply.header('Content-Type', result.contentType);
    reply.header('Content-Disposition', `attachment; filename="${result.filename}"`);
    reply.send(result.content);
  }
}
