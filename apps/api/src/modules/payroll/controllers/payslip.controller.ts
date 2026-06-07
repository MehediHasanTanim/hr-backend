import {
  Controller, Get, Inject, Param, Query,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import { PayslipService } from '../services/payslip.service';
import type { RequestContext } from '../../../common/context/request-context';

@Controller()
export class PayslipController {
  constructor(
    @Inject(PayslipService) private readonly service: PayslipService,
  ) {}

  @Get('payslips')
  @Require.read('payroll')
  list(
    @Query('employeeId') employeeId: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.listPayslips(user, {
      employeeId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('payslips/:id')
  @Require.read('payroll')
  get(@Param('id') id: string, @CurrentUser() user: RequestContext) {
    return this.service.getPayslip(id, user);
  }
}
