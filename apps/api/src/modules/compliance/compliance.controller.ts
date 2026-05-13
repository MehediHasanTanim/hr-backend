import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../common/context/request-context';

@Controller('compliance')
export class ComplianceController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('audit-logs')
  @Require.read('admin')
  auditLogs(@CurrentUser() user: RequestContext) {
    return this.prisma.unscopedClient.auditLog.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
