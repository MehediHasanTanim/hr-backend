import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../common/context/request-context';

@Controller('leave')
export class LeaveController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('types')
  @Require.read('leave')
  types(@CurrentUser() user: RequestContext) {
    return this.prisma.forCompany(user.companyId).leaveType.findMany({
      where: { companyId: user.companyId },
      orderBy: { code: 'asc' },
    });
  }
}
