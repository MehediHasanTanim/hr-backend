import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../common/context/request-context';

@Controller('departments')
export class DepartmentsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @Require.read('employee')
  list(@CurrentUser() user: RequestContext) {
    return this.prisma.forCompany(user.companyId).department.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }
}
