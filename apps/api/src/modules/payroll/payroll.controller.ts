import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../common/context/request-context';

@Controller()
export class PayrollController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('payroll/cycles')
  @Require.read('payroll')
  cycles(@CurrentUser() user: RequestContext) {
    return this.prisma.forCompany(user.companyId).payPeriod.findMany({
      where: { companyId: user.companyId },
      orderBy: { startDate: 'desc' },
    });
  }

  @Get('payslips')
  payslips(@CurrentUser() user: RequestContext) {
    return this.prisma.unscopedClient.payslip.findMany({
      where: { employee: { userId: user.userId, companyId: user.companyId } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
